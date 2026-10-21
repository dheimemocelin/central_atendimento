export class DomainError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}
export type Actor = { id: string; role: string };
export function requireAdmin(user: Actor) {
  if (user.role !== "ADMIN")
    throw new DomainError("Acesso exclusivo do administrador.", 403);
}
export function assertPortfolio(user: Actor, ownerId: string | null) {
  if (user.role !== "ADMIN" && user.id !== ownerId)
    throw new DomainError("Registro não encontrado.", 404);
}
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  if (!/^55[1-9][0-9](?:[2-5][0-9]{7}|9[0-9]{8})$/.test(digits)) return null;
  return digits;
}
export const initialStages = [
  {
    id: "new",
    name: "Novo",
    position: 0,
    kind: "OPEN",
    allowedFrom: [],
    requiresTask: false,
  },
  {
    id: "attempt",
    name: "Tentativa de contato",
    position: 1,
    kind: "OPEN",
    allowedFrom: ["new", "active", "waiting"],
    requiresTask: false,
  },
  {
    id: "active",
    name: "Em atendimento",
    position: 2,
    kind: "OPEN",
    allowedFrom: ["new", "attempt", "waiting"],
    requiresTask: false,
  },
  {
    id: "waiting",
    name: "Aguardando retorno",
    position: 3,
    kind: "OPEN",
    allowedFrom: ["attempt", "active"],
    requiresTask: true,
  },
  {
    id: "won",
    name: "Convertido",
    position: 4,
    kind: "WON",
    allowedFrom: ["new", "attempt", "active", "waiting"],
    requiresTask: false,
  },
  {
    id: "lost",
    name: "Perdido",
    position: 5,
    kind: "LOST",
    allowedFrom: ["new", "attempt", "active", "waiting"],
    requiresTask: false,
  },
];
export function validateTransition(input: {
  current: { id: string; kind: string };
  target: {
    id: string;
    kind: string;
    active: boolean;
    allowedFrom: string[];
    requiresTask: boolean;
  };
  role: string;
  reason?: string;
  lossReasonId?: string;
  conversion?: string;
  hasPendingTask: boolean;
}) {
  const { current, target } = input;
  if (!target.active) throw new DomainError("Esta etapa foi desativada.");
  if (current.id === target.id)
    throw new DomainError("O lead já está nesta etapa.");
  if (current.kind !== "OPEN") {
    if (
      input.role !== "ADMIN" ||
      !input.reason?.trim() ||
      target.kind !== "OPEN"
    )
      throw new DomainError(
        "Reabertura exige administrador, etapa aberta e justificativa.",
      );
  } else if (!target.allowedFrom.includes(current.id))
    throw new DomainError("Transição não permitida pela regra da etapa.");
  if (target.requiresTask && !input.hasPendingTask)
    throw new DomainError("Agende um retorno antes de mover para esta etapa.");
  if (target.kind === "LOST" && !input.lossReasonId)
    throw new DomainError("Informe o motivo da perda.");
  if (target.kind === "WON" && !input.conversion?.trim())
    throw new DomainError("Informe os dados da conversão.");
}
export function distribute<T>(
  leads: T[],
  owners: string[],
): { lead: T; ownerId: string }[] {
  if (!owners.length || new Set(owners).size !== owners.length)
    throw new DomainError("Escolha responsáveis distintos.");
  return leads.map((lead, i) => ({ lead, ownerId: owners[i % owners.length] }));
}
export function rate(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}
export function businessDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Porto_Velho",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function dateBound(value: string, end = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new DomainError("Data inválida.");
  const date = new Date(`${value}T00:00:00-04:00`);
  if (!Number.isFinite(date.getTime()) || businessDay(date) !== value)
    throw new DomainError("Data inválida.");
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
