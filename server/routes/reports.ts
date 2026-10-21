import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db.js";
import { portfolioWhere, portfolioWindow } from "../portfolio-query.js";
import { authenticate } from "../security.js";
import { businessDay, dateBound, DomainError, rate } from "../domain.js";
import { scope } from "./leads.js";
export async function registerReports(app: FastifyInstance) {
  app.get("/api/dashboard", { preHandler: authenticate }, async (req) => {
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        ownerId: z.string().optional(),
        stageId: z.string().optional(),
        resultId: z.string().optional(),
      })
      .parse(req.query);
    const { from, to } = portfolioWindow(q);
    const where = portfolioWhere(req.actor, q);
    return db.$transaction(
      async (tx) => {
        const leads = await tx.lead.findMany({
          where,
          include: {
            stage: true,
            owner: { select: { id: true, name: true } },
            lossReason: true,
            interactions: { where: { createdAt: { lt: to } } },
            conversions: { where: { createdAt: { lt: to } } },
            tasks: true,
          },
        });
        const total = leads.length;
        const assigned = leads.filter((l) => l.ownerId).length;
        const worked = leads.filter((l) =>
          l.interactions.some((i) => i.attempt),
        ).length;
        const contacted = leads.filter((l) =>
          l.interactions.some((i) => i.effectiveContact),
        ).length;
        const converted = leads.filter(
          (l) => l.stage.kind === "WON" && l.conversions.length,
        ).length;
        const lost = leads.filter((l) => l.stage.kind === "LOST").length;
        const pendingTasks = leads
          .flatMap((l) => l.tasks)
          .filter((t) => !t.completedAt);
        const now = new Date();
        const activityScope: Prisma.LeadWhereInput = {
          AND: [
            scope(req.actor),
            ...(q.stageId ? [{ stageId: q.stageId }] : []),
          ],
        };
        const activity = await tx.interaction.findMany({
          where: {
            lead: activityScope,
            createdAt: { gte: from, lt: to },
            ...(q.ownerId
              ? { userId: q.ownerId }
              : req.actor.role === "FREELANCER"
                ? { userId: req.actor.id }
                : {}),
            ...(q.resultId ? { resultId: q.resultId } : {}),
          },
        });
        const periodConversions = await tx.conversion.findMany({
          where: {
            lead: activityScope,
            createdAt: { gte: from, lt: to },
            ...(q.ownerId
              ? { userId: q.ownerId }
              : req.actor.role === "FREELANCER"
                ? { userId: req.actor.id }
                : {}),
          },
        });
        const days = new Map<
          string,
          {
            day: string;
            attempts: number;
            contacts: number;
            conversions: number;
          }
        >();
        for (const i of activity) {
          const day = businessDay(i.createdAt);
          const item = days.get(day) || {
            day,
            attempts: 0,
            contacts: 0,
            conversions: 0,
          };
          item.attempts += Number(i.attempt);
          item.contacts += Number(i.effectiveContact);
          days.set(day, item);
        }
        for (const c of periodConversions) {
          const day = businessDay(c.createdAt);
          const item = days.get(day) || {
            day,
            attempts: 0,
            contacts: 0,
            conversions: 0,
          };
          item.conversions++;
          days.set(day, item);
        }
        const stages = await tx.stage.findMany({
          orderBy: { position: "asc" },
        });
        const owners = await tx.user.findMany({
          where:
            req.actor.role === "ADMIN"
              ? { role: "FREELANCER" }
              : { id: req.actor.id },
          select: { id: true, name: true },
        });
        const byOwner = owners.map((u) => {
          const portfolio = leads.filter((l) => l.ownerId === u.id);
          const w = portfolio.filter((l) =>
            l.interactions.some((i) => i.attempt),
          ).length;
          return {
            id: u.id,
            name: u.name,
            assigned: portfolio.length,
            worked: w,
            coverage: rate(w, portfolio.length),
            attempts: activity.filter((i) => i.userId === u.id && i.attempt)
              .length,
            converted: portfolio.filter((l) => l.stage.kind === "WON").length,
          };
        });
        const lossReasons = [
          ...new Set(
            leads.filter((l) => l.lossReason).map((l) => l.lossReason!.name),
          ),
        ].map((name) => ({
          name,
          count: leads.filter(
            (l) => l.stage.kind === "LOST" && l.lossReason?.name === name,
          ).length,
        }));
        return {
          asOf: to.toISOString(),
          metrics: {
            total,
            assigned,
            worked,
            pending: total - worked,
            attempts: activity.filter((i) => i.attempt).length,
            contacted,
            noResponse: leads.filter(
              (l) =>
                l.interactions.some((i) => i.noResponse) &&
                !l.interactions.some((i) => i.effectiveContact),
            ).length,
            converted,
            lost,
            scheduled: pendingTasks.length,
            overdue: pendingTasks.filter((t) => t.dueAt < now).length,
            contactRate: rate(contacted, worked),
            conversionRate: rate(converted, worked),
            coverage: rate(
              leads.filter(
                (l) => l.ownerId && l.interactions.some((i) => i.attempt),
              ).length,
              assigned,
            ),
          },
          daily: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
          funnel: stages.map((s) => ({
            id: s.id,
            name: s.name,
            count: leads.filter((l) => l.stageId === s.id).length,
          })),
          byOwner,
          lossReasons,
          basis:
            "Carteira atual com evidências até o fim do período; atividade e conversões do gráfico dentro do intervalo. Horários America/Porto_Velho.",
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  });
}
