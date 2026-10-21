import type { Prisma } from "@prisma/client";
import { initialStages } from "./domain.js";
export async function initializeCatalogs(tx: Prisma.TransactionClient) {
  await tx.pipeline.upsert({
    where: { id: "commercial" },
    create: { id: "commercial", name: "Atendimento comercial" },
    update: {},
  });
  for (const stage of initialStages)
    await tx.stage.upsert({
      where: { id: stage.id },
      create: stage,
      update: {},
    });
  const entries = [
    { type: "CHANNEL", name: "WhatsApp" },
    { type: "CHANNEL", name: "Telefone" },
    { type: "CHANNEL", name: "E-mail" },
    { type: "RESULT", name: "Sem resposta", attempt: true, noResponse: true },
    {
      type: "RESULT",
      name: "Contato efetivo",
      attempt: true,
      effectiveContact: true,
    },
    { type: "RESULT", name: "Telefone inválido", attempt: true },
    { type: "RESULT", name: "Observação interna" },
    { type: "PRIORITY", name: "Normal" },
    { type: "PRIORITY", name: "Alta" },
    { type: "PRIORITY", name: "Baixa" },
  ];
  for (const entry of entries)
    await tx.catalog.upsert({
      where: { type_name: { type: entry.type, name: entry.name } },
      create: entry,
      update: {},
    });
  for (const name of [
    "Sem interesse",
    "Já comprou",
    "Fora do perfil",
    "Contato inválido",
    "Outro",
  ])
    await tx.lossReason.upsert({
      where: { name },
      create: { name },
      update: {},
    });
}
