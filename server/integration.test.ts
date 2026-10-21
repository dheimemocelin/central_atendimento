import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { FastifyInstance } from "fastify";
const enabled =
  !!process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes("COLOQUE_A_SENHA");
describe.skipIf(!enabled)("API com PostgreSQL isolado", () => {
  let app: FastifyInstance;
  let db: PrismaClient;
  let base: PrismaClient;
  const schema = `crm_test_${Date.now()}`;
  let adminId: string;
  let aId: string;
  let bId: string;
  let leadId: string;
  let aCookie: string;
  let bCookie: string;
  let adminCookie: string;
  let catalogs: any;
  const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5173";
  const headers = (cookie = adminCookie) => ({
    origin,
    "x-crm-request": "1",
    cookie,
  });
  beforeAll(async () => {
    const original = process.env.DATABASE_URL!;
    const url = new URL(original);
    if (url.pathname !== "/crm_demo")
      throw new Error("Testes exigem o banco dedicado crm_demo.");
    base = new PrismaClient({ datasourceUrl: original });
    await base.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    process.env.DATABASE_URL = url.toString();
    const binary =
      process.env.PSQL_PATH || "C:/Program Files/PostgreSQL/17/bin/psql.exe";
    const result = spawnSync(
      binary,
      [
        "-w",
        "-v",
        "ON_ERROR_STOP=1",
        "-h",
        url.hostname,
        "-p",
        url.port || "5432",
        "-U",
        decodeURIComponent(url.username),
        "-d",
        "crm_demo",
        "-f",
        "prisma/migrations/202610200001_initial/migration.sql",
        "-f",
        "prisma/migrations/202610200002_lead_review/migration.sql",
        "-f",
        "prisma/migrations/202610200003_direct_contact/migration.sql",
      ],
      {
        env: {
          ...process.env,
          PGPASSWORD: decodeURIComponent(url.password),
          PGOPTIONS: `-c search_path=${schema}`,
        },
        encoding: "utf8",
      },
    );
    if (result.status !== 0)
      throw new Error("Falha ao preparar schema isolado de testes.");
    db = (await import("./db.js")).db;
    const { initializeCatalogs } = await import("./catalogs.js");
    const { hashPassword } = await import("./security.js");
    await db.$transaction((tx) => initializeCatalogs(tx));
    const passwordHash = await hashPassword("Acesso de teste 2026!");
    const admin = await db.user.create({
      data: {
        name: "Administrador de teste",
        email: "admin@crm.test",
        role: "ADMIN",
        passwordHash,
      },
    });
    adminId = admin.id;
    aId = (
      await db.user.create({
        data: { name: "Freelancer A", email: "a@crm.test", passwordHash },
      })
    ).id;
    bId = (
      await db.user.create({
        data: { name: "Freelancer B", email: "b@crm.test", passwordHash },
      })
    ).id;
    leadId = (
      await db.lead.create({ data: { name: "Lead isolado", ownerId: aId } })
    ).id;
    await db.lead.create({ data: { name: "Carteira B", ownerId: bId } });
    app = await (await import("./app.js")).buildApp();
    const login = async (email: string) => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin, "x-crm-request": "1" },
        payload: { email, password: "Acesso de teste 2026!" },
      });
      expect(res.statusCode).toBe(200);
      return String(res.headers["set-cookie"]).split(";")[0];
    };
    adminCookie = await login("admin@crm.test");
    aCookie = await login("a@crm.test");
    bCookie = await login("b@crm.test");
    catalogs = (
      await app.inject({ url: "/api/catalogs", headers: headers() })
    ).json();
  }, 60000);
  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.$disconnect();
    if (base && /^crm_test_\d+$/.test(schema)) {
      await base.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await base.$disconnect();
    }
  });
  it("isola carteira e bloqueia enumeração, alterações e administração", async () => {
    const bList = (
      await app.inject({ url: "/api/leads", headers: headers(bCookie) })
    ).json();
    expect(bList).toHaveLength(1);
    expect(bList[0].name).toBe("Carteira B");
    const list = (
      await app.inject({ url: "/api/leads", headers: headers(aCookie) })
    ).json();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Lead isolado");
    expect(list[0]).not.toHaveProperty("originalData");
    const other = await db.lead.findFirstOrThrow({ where: { ownerId: bId } });
    expect(
      (
        await app.inject({
          url: "/api/leads/" + other.id,
          headers: headers(aCookie),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/leads/" + other.id,
          headers: headers(aCookie),
          payload: { priorityId: null },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: "/api/users", headers: headers(aCookie) }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/leads?ownerId=" + bId,
          headers: headers(aCookie),
        })
      ).json(),
    ).toHaveLength(0);
  });
  it("preserva histórico, não duplica clientes nas taxas e valida versão de card", async () => {
    const channelId = catalogs.catalogs.find(
      (c: any) => c.type === "CHANNEL",
    ).id;
    const resultId = catalogs.catalogs.find((c: any) => c.effectiveContact).id;
    for (let i = 0; i < 2; i++)
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/leads/${leadId}/interactions`,
            headers: headers(aCookie),
            payload: {
              channelId,
              resultId,
              type: "CONTACT",
              note: "Interação de teste " + i,
            },
          })
        ).statusCode,
      ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/leads/${leadId}/stage`,
          headers: headers(aCookie),
          payload: { stageId: "attempt", version: 0 },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/leads/${leadId}/stage`,
          headers: headers(aCookie),
          payload: { stageId: "active", version: 0 },
        })
      ).statusCode,
    ).toBe(409);
    const detail = (
      await app.inject({
        url: "/api/leads/" + leadId,
        headers: headers(aCookie),
      })
    ).json();
    expect(detail.interactions).toHaveLength(2);
    expect(detail.stageId).toBe("attempt");
    const r = (
      await app.inject({ url: "/api/dashboard", headers: headers() })
    ).json();
    expect(r.metrics).toMatchObject({
      total: 2,
      assigned: 2,
      worked: 1,
      contacted: 1,
      attempts: 2,
      contactRate: 1,
      coverage: 0.5,
    });
  });
  it("mantém produtividade do autor após redistribuição e revoga a carteira antiga", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/assignments",
      headers: headers(),
      payload: {
        leadIds: [leadId],
        owners: [bId],
        reason: "Redistribuição de teste",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          url: "/api/leads/" + leadId,
          headers: headers(aCookie),
        })
      ).statusCode,
    ).toBe(404);
    const r = (
      await app.inject({
        url: "/api/dashboard?ownerId=" + aId,
        headers: headers(),
      })
    ).json();
    expect(r.metrics.total).toBe(0);
    expect(r.metrics.attempts).toBe(2);
  });
  it("não publica regra de retorno incompatível com leads existentes", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/settings",
      headers: headers(),
      payload: {
        entity: "stage",
        id: "attempt",
        name: "Tentativa",
        active: true,
        allowedFrom: ["new"],
        requiresTask: true,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/settings",
          headers: headers(),
          payload: {
            entity: "stage",
            id: "waiting",
            name: "Aguardando retorno",
            active: true,
            allowedFrom: ["attempt"],
            requiresTask: false,
          },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("importação é reconciliável e confirmação é idempotente", async () => {
    const base64 = Buffer.from(
      "Nome;Telefone\nImportado A;69988881234\nImportado B;69977771234\nRevisar;123",
    ).toString("base64");
    const preview = (
      await app.inject({
        method: "POST",
        url: "/api/imports/preview",
        headers: headers(),
        payload: {
          fileName: "teste.csv",
          base64,
          mapping: { name: "Nome", phone: ["Telefone"] },
        },
      })
    ).json();
    expect(preview.report).toMatchObject({ total: 3, valid: 2, review: 1 });
    const input = {
      owners: [aId, bId],
      excluded: [{ row: 4, reason: "Telefone precisa de correção" }],
    };
    const res = await app.inject({
      method: "POST",
      url: `/api/imports/${preview.id}/confirm`,
      headers: headers(),
      payload: input,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().report.imported).toBe(2);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/imports/${preview.id}/confirm`,
          headers: headers(),
          payload: input,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/leads", headers: headers() })).json(),
    ).toHaveLength(4);
  });
  it("retorno atrasado e encerramentos preservam invariantes e histórico", async () => {
    const detail = async () =>
      (
        await app.inject({ url: "/api/leads/" + leadId, headers: headers() })
      ).json();
    const task = await app.inject({
      method: "POST",
      url: `/api/leads/${leadId}/tasks`,
      headers: headers(),
      payload: {
        title: "Retorno vencido de teste",
        dueAt: "2020-01-01T10:00:00-04:00",
      },
    });
    expect(task.statusCode).toBe(200);
    let lead = await detail();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/leads/${leadId}/stage`,
          headers: headers(),
          payload: { stageId: "waiting", version: lead.version },
        })
      ).statusCode,
    ).toBe(200);
    const report = (
      await app.inject({ url: "/api/dashboard", headers: headers() })
    ).json();
    expect(report.metrics.overdue).toBe(1);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/tasks/${task.json().id}`,
          headers: headers(),
          payload: { complete: true },
        })
      ).statusCode,
    ).toBe(400);
    lead = await detail();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/leads/${leadId}/stage`,
          headers: headers(),
          payload: { stageId: "active", version: lead.version },
        })
      ).statusCode,
    ).toBe(200);
    lead = await detail();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/leads/${leadId}/stage`,
          headers: headers(),
          payload: {
            stageId: "won",
            version: lead.version,
            conversion: "Venda de teste validada",
            amount: 100,
          },
        })
      ).statusCode,
    ).toBe(200);
    lead = await detail();
    expect(lead.conversions).toHaveLength(1);
    expect(lead.interactions).toHaveLength(2);
    expect(lead.tasks[0].completedAt).not.toBeNull();
    await expect(db.leadEvent.deleteMany()).rejects.toThrow();
  });
  it("preserva registros com alerta sem atribuição e distribui sem perder dados", async () => {
    const base64 = Buffer.from(
      "Nome;Telefone\nRevisão isolada A;123\nRevisão isolada B;69966669876",
    ).toString("base64");
    const preview = (
      await app.inject({
        method: "POST",
        url: "/api/imports/preview",
        headers: headers(),
        payload: {
          fileName: "revisao.csv",
          base64,
          mapping: { name: "Nome", phone: ["Telefone"] },
        },
      })
    ).json();
    const url = `/api/imports/${preview.id}/confirm`;
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: headers(),
          payload: { unassigned: true },
        })
      ).statusCode,
    ).toBe(400);
    const response = await app.inject({
      method: "POST",
      url,
      headers: headers(),
      payload: {
        unassigned: true,
        includeReview: true,
        reviewReason: "Preservar toda a fonte para revisão operacional",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().report).toMatchObject({
      imported: 2,
      reviewImported: 1,
      excluded: [],
    });
    const all = (
      await app.inject({ url: "/api/leads", headers: headers() })
    ).json();
    const imported = all.filter((l: any) => l.batchId === preview.id);
    expect(imported).toHaveLength(2);
    expect(imported.every((l: any) => l.ownerId === null)).toBe(true);
    expect(
      imported.find((l: any) => l.name === "Revisão isolada A"),
    ).toMatchObject({
      phone: null,
      rawPhone: "123",
      reviewIssues: ["Telefone inválido ou ausente"],
    });
    const own = (
      await app.inject({ url: "/api/leads", headers: headers(aCookie) })
    ).json();
    expect(own.some((l: any) => l.batchId === preview.id)).toBe(false);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/assignments",
          headers: headers(),
          payload: {
            leadIds: imported.map((l: any) => l.id),
            owners: [aId, bId],
            reason: "Divisão equilibrada do lote completo",
          },
        })
      ).statusCode,
    ).toBe(200);
    const assigned = (
      await app.inject({ url: "/api/leads", headers: headers() })
    )
      .json()
      .filter((l: any) => l.batchId === preview.id);
    expect(assigned.filter((l: any) => l.ownerId === aId)).toHaveLength(1);
    expect(assigned.filter((l: any) => l.ownerId === bId)).toHaveLength(1);
  });
  it("código de recuperação só pode ser usado uma vez e revoga sessões", async () => {
    const issue = (
      await app.inject({
        method: "POST",
        url: "/api/users/" + aId + "/reset",
        headers: headers(),
        payload: {},
      })
    ).json();
    const payload = {
      token: issue.resetToken,
      password: "Nova senha de teste 2026!",
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/reset",
          headers: headers(),
          payload,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/reset",
          headers: headers(),
          payload,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ url: "/api/auth/me", headers: headers(aCookie) }))
        .statusCode,
    ).toBe(401);
  });
  it("drilldown reconcilia resultado e evidências até o fim do período", async () => {
    const channelId = catalogs.catalogs.find(
      (c: any) => c.type === "CHANNEL",
    ).id;
    const resultId = catalogs.catalogs.find((c: any) => c.effectiveContact).id;
    const first = await db.lead.create({
      data: {
        name: "Histórico no período",
        ownerId: aId,
        createdAt: new Date("2020-01-01T04:00:00Z"),
      },
    });
    const second = await db.lead.create({
      data: {
        name: "Contato após o período",
        ownerId: aId,
        createdAt: new Date("2020-01-01T04:00:00Z"),
      },
    });
    for (const [lead, at] of [
      [first, "2020-02-01T12:00:00Z"],
      [second, "2026-01-01T12:00:00Z"],
    ] as const)
      await db.interaction.create({
        data: {
          leadId: lead.id,
          userId: aId,
          channelId,
          resultId,
          type: "CONTACT",
          note: "Fixture temporal isolada",
          attempt: true,
          effectiveContact: true,
          noResponse: false,
          createdAt: new Date(at),
        },
      });
    const filters = new URLSearchParams({
      from: "2020-01-01",
      to: "2020-12-31",
      ownerId: aId,
    });
    const report = (
      await app.inject({ url: "/api/dashboard?" + filters, headers: headers() })
    ).json();
    const contacted = (
      await app.inject({
        url: "/api/leads?" + filters + "&metric=contacted",
        headers: headers(),
      })
    ).json();
    expect(report.metrics.contacted).toBe(1);
    expect(contacted.map((l: any) => l.id)).toEqual([first.id]);
    filters.set("resultId", resultId);
    const filteredReport = (
      await app.inject({ url: "/api/dashboard?" + filters, headers: headers() })
    ).json();
    const filteredList = (
      await app.inject({
        url: "/api/leads?" + filters + "&metric=total",
        headers: headers(),
      })
    ).json();
    expect(filteredReport.metrics.total).toBe(1);
    expect(filteredList.map((l: any) => l.id)).toEqual([first.id]);
  });
  it("recriar a API mantém sessão e histórico; desativar revoga o acesso", async () => {
    await app.close();
    app = await (await import("./app.js")).buildApp();
    expect(
      (await app.inject({ url: "/api/auth/me", headers: headers() }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({ url: "/api/leads/" + leadId, headers: headers() })
      ).json().interactions,
    ).toHaveLength(2);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/users/" + bId,
          headers: headers(),
          payload: { active: false },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/auth/me", headers: headers(bCookie) }))
        .statusCode,
    ).toBe(401);
  });
});
