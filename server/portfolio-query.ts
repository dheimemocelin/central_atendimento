import type { Prisma } from "@prisma/client";
import { dateBound, DomainError, type Actor } from "./domain.js";
export type PortfolioFilters = {
  ownerId?: string;
  stageId?: string;
  resultId?: string;
  from?: string;
  to?: string;
  asOf?: string;
};
export function portfolioWindow(q: PortfolioFilters) {
  const from = q.from ? dateBound(q.from) : new Date(0);
  const to = q.to
    ? dateBound(q.to, true)
    : q.asOf
      ? new Date(q.asOf)
      : new Date();
  if (from > to || !Number.isFinite(to.getTime()))
    throw new DomainError("O início do período deve ser anterior ao fim.");
  return { from, to };
}
export function portfolioWhere(
  actor: Actor,
  q: PortfolioFilters,
): Prisma.LeadWhereInput {
  const { from, to } = portfolioWindow(q);
  return {
    AND: [
      actor.role === "ADMIN" ? {} : { ownerId: actor.id },
      ...(q.ownerId ? [{ ownerId: q.ownerId }] : []),
      ...(q.stageId ? [{ stageId: q.stageId }] : []),
      ...(q.resultId
        ? [
            {
              interactions: {
                some: {
                  resultId: q.resultId,
                  createdAt: { gte: from, lt: to },
                },
              },
            },
          ]
        : []),
    ],
    createdAt: { lt: to },
  };
}
export function metricWhere(
  metric: string,
  q: PortfolioFilters,
): Prisma.LeadWhereInput {
  const { to } = portfolioWindow(q);
  if (metric === "worked")
    return { interactions: { some: { attempt: true, createdAt: { lt: to } } } };
  if (metric === "contacted")
    return {
      interactions: { some: { effectiveContact: true, createdAt: { lt: to } } },
    };
  if (metric === "converted")
    return {
      stage: { kind: "WON" },
      conversions: { some: { createdAt: { lt: to } } },
    };
  return {};
}
