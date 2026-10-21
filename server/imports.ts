import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { normalizePhone, DomainError } from "./domain.js";
export const mappingSchema = z.object({
  name: z.string().min(1),
  phone: z.array(z.string()).min(1),
  email: z.string().optional(),
  source: z.string().optional(),
  originalId: z.string().optional(),
});
export type Mapping = z.infer<typeof mappingSchema>;
export type ImportRow = {
  row: number;
  name: string;
  phone: string | null;
  rawPhone: string | null;
  email: string | null;
  source: string;
  originalId: string | null;
  issues: string[];
  original: Record<string, string>;
};
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((v) => v.text).join("");
    if ("text" in value) return String(value.text);
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    return "";
  }
  return String(value).trim();
}
export async function parseFile(fileName: string, buffer: Buffer) {
  let rows: string[][];
  if (/\.xlsx$/i.test(fileName)) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as never);
    const sheet = book.worksheets[0];
    if (!sheet || sheet.rowCount > 10001 || sheet.columnCount > 200)
      throw new DomainError(
        "Planilha vazia ou acima do limite de 10 mil linhas/200 colunas.",
      );
    rows = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let i = 1; i <= sheet.columnCount; i++)
        cells.push(cellText(row.getCell(i).value));
      rows.push(cells);
    });
  } else if (/\.csv$/i.test(fileName)) {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const first = text.split(/\r?\n/)[0];
    try {
      rows = parse(text, {
        delimiter: first.includes(";") ? ";" : ",",
        bom: true,
        relax_column_count_less: true,
        skip_empty_lines: false,
        max_record_size: 100000,
      });
    } catch {
      throw new DomainError(
        "CSV inválido. Confira aspas, delimitador e linhas com mais campos que o cabeçalho. Nenhuma linha foi importada.",
      );
    }
  } else throw new DomainError("Envie um arquivo CSV UTF-8 ou XLSX.");
  if (!rows.length || rows.length > 10001)
    throw new DomainError("Arquivo vazio ou acima do limite de 10 mil linhas.");
  const headers = rows[0].map((h, i) => h.trim() || `Coluna ${i + 1}`);
  if (new Set(headers).size !== headers.length)
    throw new DomainError(
      "O cabeçalho tem nomes repetidos. Renomeie as colunas antes de importar.",
    );
  const records = rows.slice(1).map((cells, i) => ({
    row: i + 2,
    original: Object.fromEntries(
      headers.map((h, j) => [h, String(cells[j] ?? "").trim()]),
    ),
  }));
  return { headers, records };
}
export function analyzeRows(
  records: { row: number; original: Record<string, string> }[],
  mapping: Mapping,
  existingPhones: Set<string> = new Set(),
) {
  const seen = new Set(existingPhones);
  let blank = 0;
  const rows: ImportRow[] = [];
  for (const entry of records) {
    const r = entry.original;
    if (!Object.values(r).some(Boolean)) {
      blank++;
      continue;
    }
    const name = (r[mapping.name] || "").trim();
    const phone =
      mapping.phone.map((h) => normalizePhone(r[h] || "")).find(Boolean) ??
      null;
    const emailValue = mapping.email ? r[mapping.email] : "";
    const email =
      emailValue && z.email().safeParse(emailValue).success ? emailValue : null;
    const issues: string[] = [];
    if (!name) issues.push("Nome ausente");
    if (!phone) issues.push("Telefone inválido ou ausente");
    if (phone && seen.has(phone))
      issues.push("Possível duplicidade de telefone");
    if (emailValue && !email) issues.push("E-mail inválido");
    if (phone) seen.add(phone);
    rows.push({
      row: entry.row,
      name,
      phone,
      rawPhone: mapping.phone.map((h) => r[h]).find(Boolean) || null,
      email,
      source: mapping.source ? r[mapping.source] || "Importação" : "Importação",
      originalId: mapping.originalId ? r[mapping.originalId] || null : null,
      issues,
      original: r,
    });
  }
  return {
    rows,
    report: {
      total: records.length,
      blank,
      valid: rows.filter((r) => !r.issues.length).length,
      review: rows.filter((r) => r.issues.length).length,
    },
  };
}
