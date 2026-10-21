export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CRM-Request": "1",
      ...options.headers,
    },
  });
  const body = await response
    .json()
    .catch(() => ({ message: "Resposta inválida do servidor." }));
  if (!response.ok)
    throw new ApiError(
      body.message || "Não foi possível concluir.",
      response.status,
    );
  return body;
}
export const send = (path: string, body: unknown, method = "POST") =>
  api(path, { method, body: JSON.stringify(body) });
export const fmt = (date: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Porto_Velho",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
export const percent = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
export function dayKey(date: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Porto_Velho",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
export function localInputToISO(value: string) {
  return new Date(value + ":00-04:00").toISOString();
}
