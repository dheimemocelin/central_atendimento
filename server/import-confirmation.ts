import { z } from "zod";
import { db } from "./db.js";
import { distribute, DomainError, requireAdmin, type Actor } from "./domain.js";
import { mappingSchema, type ImportRow } from "./imports.js";
import { audit } from "./routes/leads.js";

export const confirmImportSchema = z
  .object({
    owners: z.array(z.string()).max(10).default([]),
    unassigned: z.boolean().default(false),
    includeReview: z.boolean().default(false),
    reviewReason: z.string().trim().min(3).max(1000).optional(),
    excluded: z
      .array(
        z.object({
          row: z.number().int(),
          reason: z.string().trim().min(3).max(500),
        }),
      )
      .default([]),
  })
  .refine(
    (v) => (v.unassigned ? v.owners.length === 0 : v.owners.length > 0),
    "Escolha responsáveis ou a importação sem responsável.",
  );

export async function confirmImport(
  actor: Actor,
  id: string,
  input: z.infer<typeof confirmImportSchema>,
) {
  requireAdmin(actor);
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(704213)::text`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(704214)::text`;
      const batch = await tx.importBatch.findUnique({ where: { id } });
      if (!batch) throw new DomainError("Lote não encontrado.", 404);
      if (batch.status === "CONFIRMED")
        return { ok: true, report: batch.report };
      if (
        await tx.importBatch.findFirst({
          where: { hash: batch.hash, status: "CONFIRMED" },
        })
      )
        throw new DomainError("Este arquivo já foi confirmado.");
      if (
        new Set(input.owners).size !== input.owners.length ||
        (await tx.user.count({
          where: { id: { in: input.owners }, role: "FREELANCER", active: true },
        })) !== input.owners.length
      )
        throw new DomainError("Escolha freelancers ativos e distintos.");
      const rows = batch.rows as unknown as ImportRow[];
      const excluded = new Map(input.excluded.map((v) => [v.row, v.reason]));
      if (
        excluded.size !== input.excluded.length ||
        input.excluded.some((v) => !rows.some((r) => r.row === v.row))
      )
        throw new DomainError("Linhas de exclusão inválidas.");
      const accepted = rows.filter((r) => !excluded.has(r.row));
      if (!accepted.length) throw new DomainError("Nenhuma linha elegível.");
      const reviewed = accepted.filter((r) => r.issues.length);
      if (reviewed.length && (!input.includeReview || !input.reviewReason))
        throw new DomainError(
          "Para preservar linhas com alertas, autorize a importação para revisão e registre a justificativa.",
        );
      if (
        accepted.some(
          (r) =>
            !r.name || r.issues.includes("Possível duplicidade de telefone"),
        )
      )
        throw new DomainError(
          "Nome ausente e possíveis duplicidades precisam ser corrigidos ou excluídos com justificativa.",
        );
      const phones = accepted.flatMap((r) => (r.phone ? [r.phone] : []));
      if (
        await tx.lead.findFirst({
          where: { phone: { in: phones } },
          select: { id: true },
        })
      )
        throw new DomainError(
          "Há um telefone que já foi importado. Refaça a prévia.",
        );
      const priority = await tx.catalog.findFirst({
        where: { type: "PRIORITY", name: "Normal" },
      });
      const mapping = mappingSchema.parse(batch.mapping);
      const allocations = input.owners.length
        ? distribute(accepted, input.owners)
        : accepted.map((lead) => ({ lead, ownerId: null }));
      for (const { lead: row, ownerId } of allocations) {
        const lead = await tx.lead.create({
          data: {
            name: row.name,
            phone: row.phone,
            rawPhone:
              row.rawPhone ||
              mapping.phone.map((h) => row.original[h]).find(Boolean) ||
              null,
            reviewIssues: row.issues,
            email: row.email,
            source: row.source,
            originalId: row.originalId,
            sourceRow: row.row,
            originalData: row.original,
            ownerId,
            batchId: id,
            priorityId: priority?.id,
          },
        });
        if (ownerId)
          await tx.leadAssignment.create({
            data: { leadId: lead.id, userId: ownerId },
          });
        await audit(
          tx,
          actor.id,
          "LEAD_IMPORTED",
          { batchId: id, row: row.row, ownerId, reviewIssues: row.issues },
          lead.id,
        );
      }
      const report = {
        ...(batch.report as object),
        imported: accepted.length,
        reviewImported: reviewed.length,
        reviewReason: input.reviewReason || null,
        excluded: input.excluded,
      };
      await tx.importBatch.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          report,
          distribution: {
            algorithm: input.unassigned
              ? "unassigned"
              : "source-row-round-robin",
            version: 1,
            owners: input.owners,
            count: accepted.length,
            actorId: actor.id,
          },
        },
      });
      await audit(tx, actor.id, "BATCH_CONFIRMED", {
        batchId: id,
        imported: accepted.length,
        reviewImported: reviewed.length,
        reviewReason: input.reviewReason || null,
      });
      return { ok: true, report };
    },
    { timeout: 120000 },
  );
}
