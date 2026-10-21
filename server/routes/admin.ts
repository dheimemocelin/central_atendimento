import { confirmImport, confirmImportSchema } from "../import-confirmation.js";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db.js";
import {
  authenticate,
  digest,
  hashPassword,
  publicUser,
  secret,
} from "../security.js";
import { distribute, DomainError, requireAdmin } from "../domain.js";
import {
  analyzeRows,
  mappingSchema,
  parseFile,
  type ImportRow,
} from "../imports.js";
import { audit, lockedLead } from "./leads.js";
export async function registerAdmin(app: FastifyInstance) {
  const admin = async (req: Parameters<typeof authenticate>[0]) => {
    await authenticate(req);
    requireAdmin(req.actor);
  };
  app.get("/api/users", { preHandler: admin }, async () =>
    (await db.user.findMany({ orderBy: { createdAt: "asc" } })).map(publicUser),
  );
  app.post("/api/users", { preHandler: admin }, async (req) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(150),
        email: z.email(),
        role: z.enum(["ADMIN", "FREELANCER"]).default("FREELANCER"),
      })
      .parse(req.body);
    const token = secret();
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          ...input,
          email: input.email.toLowerCase(),
          passwordHash: await hashPassword(secret()),
        },
      });
      await tx.passwordReset.create({
        data: {
          id: digest(token),
          userId: created.id,
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      await audit(tx, req.actor.id, "USER_CREATED", {
        userId: created.id,
        role: created.role,
      });
      return created;
    });
    return { user: publicUser(user), resetToken: token, expiresInMinutes: 30 };
  });
  app.patch("/api/users/:id", { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const input = z
      .object({
        active: z.boolean(),
        name: z.string().trim().min(2).max(150).optional(),
      })
      .parse(req.body);
    if (id === req.actor.id && !input.active)
      throw new DomainError("VocÃª nÃ£o pode desativar seu prÃ³prio acesso.");
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
      const user = await tx.user.update({ where: { id }, data: input });
      if (!input.active) await tx.session.deleteMany({ where: { userId: id } });
      await audit(tx, req.actor.id, "USER_UPDATED", { userId: id, ...input });
      return publicUser(user);
    });
  });
  app.post("/api/users/:id/reset", { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const token = secret();
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id } });
      if (!user?.active)
        throw new DomainError("UsuÃ¡rio inativo ou inexistente.");
      await tx.passwordReset.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordReset.create({
        data: {
          id: digest(token),
          userId: id,
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      await tx.session.deleteMany({ where: { userId: id } });
      await audit(tx, req.actor.id, "RESET_ISSUED", { userId: id });
    });
    return { resetToken: token, expiresInMinutes: 30 };
  });
  app.post(
    "/api/imports/preview",
    {
      preHandler: admin,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req) => {
      const input = z
        .object({
          fileName: z.string().max(200),
          base64: z.string().max(14000000),
          mapping: mappingSchema.optional(),
        })
        .parse(req.body);
      const buffer = Buffer.from(input.base64, "base64");
      const parsed = await parseFile(input.fileName, buffer);
      if (!input.mapping)
        return {
          headers: parsed.headers,
          sample: parsed.records.slice(0, 5),
          total: parsed.records.length,
        };
      for (const key of [
        input.mapping.name,
        ...input.mapping.phone,
        input.mapping.email,
        input.mapping.source,
        input.mapping.originalId,
      ].filter(Boolean))
        if (!parsed.headers.includes(key!))
          throw new DomainError(`Coluna inexistente: ${key}`);
      const phones = await db.lead.findMany({
        where: { phone: { not: null } },
        select: { phone: true },
      });
      const analyzed = analyzeRows(
        parsed.records,
        input.mapping,
        new Set(phones.map((v) => v.phone!)),
      );
      const batch = await db.importBatch.create({
        data: {
          fileName: input.fileName,
          hash: digest(buffer.toString("base64")),
          mapping: input.mapping,
          report: analyzed.report,
          rows: analyzed.rows as unknown as Prisma.InputJsonValue,
          userId: req.actor.id,
        },
      });
      return {
        id: batch.id,
        headers: parsed.headers,
        report: analyzed.report,
        rows: analyzed.rows.map(({ original: _, ...r }) => r),
      };
    },
  );
  app.get("/api/imports", { preHandler: admin }, async () =>
    db.importBatch.findMany({
      select: {
        id: true,
        fileName: true,
        status: true,
        report: true,
        distribution: true,
        createdAt: true,
        confirmedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  );
  app.post("/api/imports/:id/confirm", { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return confirmImport(req.actor, id, confirmImportSchema.parse(req.body));
  });
  app.post("/api/assignments", { preHandler: admin }, async (req) => {
    const input = z
      .object({
        leadIds: z.array(z.string()).min(1).max(1000),
        owners: z.array(z.string()).min(1).max(10),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(req.body);
    return db.$transaction(
      async (tx) => {
        if (
          (await tx.user.count({
            where: {
              id: { in: input.owners },
              active: true,
              role: "FREELANCER",
            },
          })) !== input.owners.length
        )
          throw new DomainError("ResponsÃ¡veis invÃ¡lidos.");
        const ids = [...new Set(input.leadIds)].sort();
        for (const { lead: id, ownerId } of distribute(ids, input.owners)) {
          const lead = await lockedLead(tx, id, req.actor);
          if (lead.ownerId === ownerId) continue;
          await tx.leadAssignment.updateMany({
            where: { leadId: id, endedAt: null },
            data: { endedAt: new Date() },
          });
          await tx.leadAssignment.create({
            data: { leadId: id, userId: ownerId },
          });
          await tx.lead.update({
            where: { id },
            data: { ownerId, version: { increment: 1 } },
          });
          await tx.task.updateMany({
            where: { leadId: id, completedAt: null },
            data: { userId: ownerId },
          });
          await audit(
            tx,
            req.actor.id,
            "LEAD_REASSIGNED",
            {
              from: lead.ownerId,
              to: ownerId,
              reason: input.reason,
              algorithm: "sorted-id-round-robin-v1",
            },
            id,
          );
        }
        return { ok: true };
      },
      { timeout: 60000 },
    );
  });
  app.post("/api/settings", { preHandler: admin }, async (req) => {
    const input = z
      .discriminatedUnion("entity", [
        z.object({
          entity: z.literal("catalog"),
          id: z.string().optional(),
          type: z.enum(["CHANNEL", "RESULT", "PRIORITY"]),
          name: z.string().trim().min(2).max(100),
          active: z.boolean(),
          attempt: z.boolean().default(false),
          effectiveContact: z.boolean().default(false),
          noResponse: z.boolean().default(false),
        }),
        z.object({
          entity: z.literal("lossReason"),
          id: z.string().optional(),
          name: z.string().trim().min(2).max(100),
          active: z.boolean(),
        }),
        z.object({
          entity: z.literal("stage"),
          id: z.string(),
          name: z.string().trim().min(2).max(100),
          active: z.boolean(),
          allowedFrom: z.array(z.string()),
          requiresTask: z.boolean(),
        }),
      ])
      .parse(req.body);
    return db.$transaction(async (tx) => {
      const { entity, id, ...data } = input;
      if (input.entity === "catalog") {
        if (input.effectiveContact && (!input.attempt || input.noResponse))
          throw new DomainError(
            "Contato efetivo exige tentativa e nÃ£o pode ser sem resposta.",
          );
        if (input.noResponse && !input.attempt)
          throw new DomainError("Sem resposta exige tentativa.");
        if (id) {
          const old = await tx.catalog.findUnique({ where: { id } });
          if (!old || old.type !== input.type)
            throw new DomainError(
              "O tipo de catÃ¡logo nÃ£o pode ser alterado.",
            );
        }
        await tx.catalog.upsert({
          where: { id: id || "__new__" },
          create: data as Prisma.CatalogCreateInput,
          update: data,
        });
      } else if (input.entity === "lossReason") {
        await tx.lossReason.upsert({
          where: { id: id || "__new__" },
          create: { name: input.name, active: input.active },
          update: { name: input.name, active: input.active },
        });
      } else {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(704214)::text`;
        const stage = await tx.stage.findUnique({ where: { id } });
        if (!stage) throw new DomainError("Etapa inexistente.");
        if (
          input.allowedFrom.includes(id!) ||
          (await tx.stage.count({
            where: { id: { in: input.allowedFrom } },
          })) !== new Set(input.allowedFrom).size
        )
          throw new DomainError("Regras de origem invÃ¡lidas.");
        if (stage.id === "new" && !input.active)
          throw new DomainError("A etapa de entrada deve permanecer ativa.");
        if (stage.id === "waiting" && !input.requiresTask)
          throw new DomainError("Aguardando retorno exige tarefa pendente.");
        if (input.requiresTask && (stage.id === "new" || stage.kind !== "OPEN"))
          throw new DomainError(
            "Etapas de entrada e encerramento nÃ£o podem exigir retorno.",
          );
        if (
          input.requiresTask &&
          (await tx.lead.count({
            where: { stageId: id, tasks: { none: { completedAt: null } } },
          }))
        )
          throw new DomainError(
            "HÃ¡ leads nesta etapa sem retorno pendente. Agende os retornos antes de ativar a regra.",
          );
        if (!input.active && (await tx.lead.count({ where: { stageId: id } })))
          throw new DomainError(
            "Mova os leads desta etapa antes de desativÃ¡-la.",
          );
        await tx.stage.update({
          where: { id },
          data: {
            name: input.name,
            active: input.active,
            allowedFrom: input.allowedFrom,
            requiresTask: input.requiresTask,
          },
        });
      }
      await audit(tx, req.actor.id, "SETTINGS_UPDATED", input);
      return { ok: true };
    });
  });
}
