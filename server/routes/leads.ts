import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db.js";
import { portfolioWhere, metricWhere } from "../portfolio-query.js";
import { authenticate } from "../security.js";
import { assertPortfolio, DomainError, validateTransition } from "../domain.js";
import type { Actor } from "../domain.js";
export const scope = (actor: Actor): Prisma.LeadWhereInput =>
  actor.role === "ADMIN" ? {} : { ownerId: actor.id };
export const leadInclude = {
  owner: { select: { id: true, name: true } },
  stage: true,
  priority: true,
  tasks: { where: { completedAt: null }, orderBy: { dueAt: "asc" as const } },
  _count: { select: { interactions: { where: { attempt: true } } } },
};
export async function lockedLead(
  tx: Prisma.TransactionClient,
  id: string,
  actor: Actor,
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(704214)::text`;
  await tx.$queryRaw`SELECT id FROM leads WHERE id = ${id} FOR UPDATE`;
  const lead = await tx.lead.findUnique({
    where: { id },
    include: { stage: true },
  });
  if (!lead) throw new DomainError("Registro não encontrado.", 404);
  assertPortfolio(actor, lead.ownerId);
  return lead;
}
export const audit = (
  tx: Prisma.TransactionClient,
  userId: string,
  type: string,
  data: Prisma.InputJsonValue,
  leadId?: string,
) => tx.leadEvent.create({ data: { userId, type, data, leadId } });
const leadId = (params: unknown) =>
  z.object({ id: z.string().min(1) }).parse(params).id;
export async function registerLeads(app: FastifyInstance) {
  app.get("/api/catalogs", { preHandler: authenticate }, async (req) => ({
    stages: await db.stage.findMany({ orderBy: { position: "asc" } }),
    catalogs: await db.catalog.findMany({ orderBy: { name: "asc" } }),
    lossReasons: await db.lossReason.findMany({ orderBy: { name: "asc" } }),
    users: await db.user.findMany({
      where: req.actor.role === "ADMIN" ? {} : { id: req.actor.id },
      select: { id: true, name: true, active: true, role: true },
    }),
  }));
  app.get("/api/leads", { preHandler: authenticate }, async (req) => {
    const q = z
      .object({
        search: z.string().max(100).optional(),
        ownerId: z.string().optional(),
        stageId: z.string().optional(),
        priorityId: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        asOf: z.iso.datetime({ offset: true }).optional(),
        resultId: z.string().optional(),
        metric: z
          .enum(["total", "worked", "contacted", "converted"])
          .optional(),
        situation: z
          .enum(["overdue", "pending", "worked", "contacted", "all"])
          .optional(),
      })
      .parse(req.query);
    const filters: Prisma.LeadWhereInput[] = [portfolioWhere(req.actor, q)];
    if (q.metric) filters.push(metricWhere(q.metric, q));
    if (q.search)
      filters.push({
        OR: ["name", "phone", "rawPhone", "email"].map((field) => ({
          [field]: { contains: q.search, mode: "insensitive" },
        })),
      });
    if (q.ownerId) filters.push({ ownerId: q.ownerId });
    if (q.stageId) filters.push({ stageId: q.stageId });
    if (q.priorityId) filters.push({ priorityId: q.priorityId });
    if (q.situation === "overdue")
      filters.push({
        tasks: { some: { completedAt: null, dueAt: { lt: new Date() } } },
      });
    if (q.situation === "pending")
      filters.push({ interactions: { none: { attempt: true } } });
    if (q.situation === "worked")
      filters.push({ interactions: { some: { attempt: true } } });
    if (q.situation === "contacted")
      filters.push({ interactions: { some: { effectiveContact: true } } });
    const leads = await db.lead.findMany({
      where: { AND: filters },
      include: leadInclude,
      orderBy: [{ sourceRow: "asc" }, { id: "asc" }],
      take: 10000,
    });
    return leads.map(({ originalData: _, ...lead }) => lead);
  });
  app.get("/api/leads/:id", { preHandler: authenticate }, async (req) => {
    const lead = await db.lead.findFirst({
      where: { id: leadId(req.params), ...scope(req.actor) },
      include: {
        ...leadInclude,
        lossReason: true,
        conversions: { orderBy: { createdAt: "desc" } },
        interactions: {
          include: {
            user: { select: { name: true } },
            channel: true,
            result: true,
          },
          orderBy: { createdAt: "desc" },
        },
        events: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
        tasks: { orderBy: { dueAt: "asc" } },
      },
    });
    if (!lead) throw new DomainError("Registro não encontrado.", 404);
    // Source data may contain CPF and tracking identifiers; do not deliver the full imported row to the browser.
    const { originalData: _, ...safe } = lead;
    return safe;
  });
  app.patch("/api/leads/:id", { preHandler: authenticate }, async (req) => {
    const input = z
      .object({ priorityId: z.string().nullable() })
      .parse(req.body);
    return db.$transaction(async (tx) => {
      await lockedLead(tx, leadId(req.params), req.actor);
      if (
        input.priorityId &&
        !(await tx.catalog.findFirst({
          where: { id: input.priorityId, type: "PRIORITY", active: true },
        }))
      )
        throw new DomainError("Prioridade inválida.");
      await tx.lead.update({
        where: { id: leadId(req.params) },
        data: { ...input, version: { increment: 1 } },
      });
      await audit(
        tx,
        req.actor.id,
        "PRIORITY_CHANGED",
        input,
        leadId(req.params),
      );
      return { ok: true };
    });
  });
  app.post(
    "/api/leads/:id/stage",
    { preHandler: authenticate },
    async (req) => {
      const input = z
        .object({
          stageId: z.string(),
          version: z.number().int(),
          reason: z.string().max(2000).optional(),
          lossReasonId: z.string().optional(),
          conversion: z.string().max(4000).optional(),
          amount: z.number().min(0).max(999999999999).optional(),
        })
        .parse(req.body);
      return db.$transaction(async (tx) => {
        const id = leadId(req.params);
        const lead = await lockedLead(tx, id, req.actor);
        if (lead.version !== input.version)
          throw new DomainError(
            "O lead foi atualizado. Recarregue antes de mover.",
            409,
          );
        const target = await tx.stage.findUnique({
          where: { id: input.stageId },
        });
        if (!target) throw new DomainError("Etapa inválida.");
        const hasPendingTask = !!(await tx.task.findFirst({
          where: { leadId: id, completedAt: null },
        }));
        validateTransition({
          current: lead.stage,
          target,
          role: req.actor.role,
          ...input,
          hasPendingTask,
        });
        if (
          target.kind === "LOST" &&
          !(await tx.lossReason.findFirst({
            where: { id: input.lossReasonId, active: true },
          }))
        )
          throw new DomainError("Motivo de perda inválido.");
        if (target.kind === "WON")
          await tx.conversion.create({
            data: {
              leadId: id,
              userId: req.actor.id,
              description: input.conversion!,
              amount: input.amount,
            },
          });
        await tx.lead.update({
          where: { id },
          data: {
            stageId: target.id,
            lossReasonId: target.kind === "LOST" ? input.lossReasonId : null,
            version: { increment: 1 },
          },
        });
        if (target.kind !== "OPEN")
          await tx.task.updateMany({
            where: { leadId: id, completedAt: null },
            data: { completedAt: new Date() },
          });
        await audit(
          tx,
          req.actor.id,
          "STAGE_CHANGED",
          {
            from: lead.stageId,
            to: target.id,
            reason: input.reason || null,
            lossReasonId: input.lossReasonId || null,
            pendingTasksClosed: target.kind !== "OPEN",
          },
          id,
        );
        return { ok: true };
      });
    },
  );
  app.post(
    "/api/leads/:id/interactions",
    { preHandler: authenticate },
    async (req) => {
      const input = z
        .object({
          channelId: z.string(),
          resultId: z.string(),
          type: z.enum(["CONTACT", "NOTE"]),
          note: z.string().trim().min(1).max(4000),
        })
        .parse(req.body);
      return db.$transaction(async (tx) => {
        const id = leadId(req.params);
        await lockedLead(tx, id, req.actor);
        const channel = await tx.catalog.findFirst({
          where: { id: input.channelId, type: "CHANNEL", active: true },
        });
        const result = await tx.catalog.findFirst({
          where: { id: input.resultId, type: "RESULT", active: true },
        });
        if (!channel || !result)
          throw new DomainError("Canal ou resultado inválido.");
        const attempt = input.type === "CONTACT" && result.attempt;
        await tx.interaction.create({
          data: {
            ...input,
            leadId: id,
            userId: req.actor.id,
            attempt,
            effectiveContact: attempt && result.effectiveContact,
            noResponse: attempt && result.noResponse,
          },
        });
        await audit(
          tx,
          req.actor.id,
          "INTERACTION_RECORDED",
          { result: result.name, channel: channel.name },
          id,
        );
        return { ok: true };
      });
    },
  );
  app.post(
    "/api/leads/:id/tasks",
    { preHandler: authenticate },
    async (req) => {
      const input = z
        .object({
          title: z.string().trim().min(2).max(250),
          dueAt: z.iso.datetime({ offset: true }),
        })
        .parse(req.body);
      return db.$transaction(async (tx) => {
        const id = leadId(req.params);
        const lead = await lockedLead(tx, id, req.actor);
        if (!lead.ownerId || lead.stage.kind !== "OPEN")
          throw new DomainError("Retornos exigem um lead aberto e atribuído.");
        const task = await tx.task.create({
          data: {
            leadId: id,
            userId: lead.ownerId,
            title: input.title,
            dueAt: new Date(input.dueAt),
          },
        });
        await audit(
          tx,
          req.actor.id,
          "TASK_SCHEDULED",
          { title: input.title, dueAt: input.dueAt },
          id,
        );
        return task;
      });
    },
  );
  app.get("/api/tasks", { preHandler: authenticate }, async (req) => {
    const query = z.object({ ownerId: z.string().optional() }).parse(req.query);
    return db.task.findMany({
      where: {
        lead: {
          AND: [
            scope(req.actor),
            ...(query.ownerId ? [{ ownerId: query.ownerId }] : []),
          ],
        },
      },
      include: {
        lead: { select: { id: true, name: true, ownerId: true } },
        user: { select: { name: true } },
      },
      orderBy: { dueAt: "asc" },
    });
  });
  app.patch("/api/tasks/:id", { preHandler: authenticate }, async (req) => {
    const input = z
      .object({
        complete: z.boolean().optional(),
        dueAt: z.iso.datetime({ offset: true }).optional(),
      })
      .refine(
        (v) => v.complete !== undefined || v.dueAt,
        "Informe uma alteração.",
      )
      .parse(req.body);
    return db.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: leadId(req.params) },
      });
      if (!task) throw new DomainError("Registro não encontrado.", 404);
      const lead = await lockedLead(tx, task.leadId, req.actor);
      if (lead.stage.kind !== "OPEN" && input.complete === false)
        throw new DomainError("Reabra o lead antes de reabrir uma tarefa.");
      if (
        input.complete &&
        lead.stage.requiresTask &&
        !(await tx.task.findFirst({
          where: { leadId: lead.id, completedAt: null, id: { not: task.id } },
        }))
      )
        throw new DomainError(
          "Mova o lead para Em atendimento ou agende outro retorno antes de concluir o último retorno.",
        );
      await tx.task.update({
        where: { id: task.id },
        data: {
          ...(input.complete !== undefined
            ? { completedAt: input.complete ? new Date() : null }
            : {}),
          ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
        },
      });
      await audit(tx, req.actor.id, "TASK_UPDATED", input, task.leadId);
      return { ok: true };
    });
  });
}
