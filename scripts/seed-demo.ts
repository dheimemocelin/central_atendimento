import "dotenv/config";
import { z } from "zod";
import { db } from "../server/db.js";
import { initializeCatalogs } from "../server/catalogs.js";
import { digest, hashPassword } from "../server/security.js";
import { demoLeads, DEMO_COUNT } from "./demo-data.js";

const day = 86400000;
const now = new Date();
const batchId = "demo-batch-v1";
async function seed() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Seed demonstrativo recusado em produção.");
  const url = new URL(process.env.DATABASE_URL || "");
  if (url.pathname !== "/crm_demo")
    throw new Error("Seed exige exclusivamente o banco crm_demo.");
  if (await db.importBatch.findUnique({ where: { id: batchId } })) {
    console.log("Demonstração já criada. Nenhum dado ou senha foi alterado.");
    return;
  }
  const passwordSchema = z.string().min(12).max(128);
  const input = z
    .object({
      DEMO_ADMIN_PASSWORD: passwordSchema,
      DEMO_AGENT_A_PASSWORD: passwordSchema,
      DEMO_AGENT_B_PASSWORD: passwordSchema,
    })
    .parse(process.env);
  if (new Set(Object.values(input)).size !== 3)
    throw new Error(
      "Defina três senhas diferentes para os usuários demonstrativos.",
    );
  const accounts = [
    {
      id: "demo-admin",
      name: "Admin demonstração",
      email: "admin@crm.example.invalid",
      role: "ADMIN",
      password: input.DEMO_ADMIN_PASSWORD,
    },
    {
      id: "demo-agent-a",
      name: "Atendente demonstração A",
      email: "atendente.a@crm.example.invalid",
      role: "FREELANCER",
      password: input.DEMO_AGENT_A_PASSWORD,
    },
    {
      id: "demo-agent-b",
      name: "Atendente demonstração B",
      email: "atendente.b@crm.example.invalid",
      role: "FREELANCER",
      password: input.DEMO_AGENT_B_PASSWORD,
    },
  ];
  const users = await Promise.all(
    accounts.map(async ({ password, ...user }) => ({
      ...user,
      passwordHash: await hashPassword(password),
    })),
  );
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(704215)`;
      if (
        (await tx.user.count()) ||
        (await tx.lead.count()) ||
        (await tx.importBatch.count())
      )
        throw new Error(
          "Seed recusado: o banco deve estar vazio. Nenhum registro existente será substituído.",
        );
      await initializeCatalogs(tx);
      await tx.user.createMany({ data: users });
      const catalogs = await tx.catalog.findMany();
      const channel = catalogs.find(
        (c) => c.type === "CHANNEL" && c.name === "E-mail",
      )!;
      const contact = catalogs.find((c) => c.effectiveContact)!;
      const unanswered = catalogs.find((c) => c.noResponse)!;
      const priority = catalogs.find(
        (c) => c.type === "PRIORITY" && c.name === "Normal",
      )!;
      const loss = await tx.lossReason.findFirstOrThrow({
        where: { name: "Sem interesse" },
      });
      const importedAt = new Date(now.getTime() - 32 * day);
      await tx.importBatch.create({
        data: {
          id: batchId,
          fileName: "gerador-sintetico-v1",
          hash: digest("central-demo-v1"),
          mapping: {},
          report: { imported: DEMO_COUNT, synthetic: true },
          rows: [],
          status: "CONFIRMED",
          distribution: { "demo-agent-a": 24, "demo-agent-b": 24 },
          userId: "demo-admin",
          createdAt: importedAt,
          confirmedAt: importedAt,
        },
      });
      for (const [index, lead] of demoLeads().entries()) {
        await tx.lead.create({
          data: {
            ...lead,
            priorityId: priority.id,
            batchId,
            createdAt: importedAt,
            lossReasonId: lead.stageId === "lost" ? loss.id : null,
          },
        });
        await tx.leadAssignment.create({
          data: {
            leadId: lead.id,
            userId: lead.ownerId,
            assignedAt: importedAt,
          },
        });
        await tx.leadEvent.create({
          data: {
            leadId: lead.id,
            userId: "demo-admin",
            type: "LEAD_IMPORTED",
            data: { synthetic: true, batchId },
            createdAt: importedAt,
          },
        });
        const contactedAt = new Date(now.getTime() - (30 - (index % 28)) * day);
        if (lead.stageId !== "new") {
          const result = lead.stageId === "attempt" ? unanswered : contact;
          await tx.interaction.create({
            data: {
              leadId: lead.id,
              userId: lead.ownerId,
              channelId: channel.id,
              resultId: result.id,
              type: "CONTACT",
              note: "Interação fictícia gerada para demonstração. Nenhuma mensagem foi enviada.",
              attempt: true,
              effectiveContact: result.effectiveContact,
              noResponse: result.noResponse,
              createdAt: contactedAt,
            },
          });
          await tx.leadEvent.create({
            data: {
              leadId: lead.id,
              userId: lead.ownerId,
              type: "INTERACTION_RECORDED",
              data: { synthetic: true },
              createdAt: contactedAt,
            },
          });
          await tx.leadEvent.create({
            data: {
              leadId: lead.id,
              userId: lead.ownerId,
              type: "STAGE_CHANGED",
              data: { from: "new", to: lead.stageId, synthetic: true },
              createdAt: contactedAt,
            },
          });
        }
        if (lead.stageId === "won")
          await tx.conversion.create({
            data: {
              leadId: lead.id,
              userId: lead.ownerId,
              description: "Conversão fictícia para demonstração",
              amount: 1000 + index * 100,
              createdAt: contactedAt,
            },
          });
        if (lead.stageId === "waiting")
          await tx.task.create({
            data: {
              leadId: lead.id,
              userId: lead.ownerId,
              title: "Retorno demonstrativo",
              dueAt: new Date(
                now.getTime() +
                  (Math.floor(index / 6) % 2 === 0 ? -1 : 1) * day,
              ),
            },
          });
      }
    },
    { timeout: 30000 },
  );
  console.log(
    "Demonstração criada: 48 contatos fictícios, 24 por atendente, seis etapas, histórico, retornos e BI. Nenhuma credencial foi impressa.",
  );
}
try {
  await seed();
} finally {
  await db.$disconnect();
}
