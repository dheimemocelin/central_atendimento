import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { analyzeRows, parseFile } from "./imports.js";
describe("importação sem descarte silencioso", () => {
  it("recusa colunas excedentes em vez de perder valores da fonte", async () => {
    await expect(
      parseFile(
        "irregular.csv",
        Buffer.from("Nome;Telefone\nAna;69999991234;campo extra"),
      ),
    ).rejects.toThrow("mais campos");
  });
  it("reconcilia vazios, inválidos e duplicados", async () => {
    const file = Buffer.from(
      "Nome;Telefone;Email\nAna;69999991234;ana@example.test\nBia;69999991234;bia@example.test\nCaio;123;invalido\n;;\n",
    );
    const parsed = await parseFile("teste.csv", file);
    const result = analyzeRows(parsed.records, {
      name: "Nome",
      phone: ["Telefone"],
      email: "Email",
    });
    expect(result.report).toEqual({ total: 4, blank: 1, valid: 1, review: 2 });
    expect(result.rows[1].issues).toContain("Possível duplicidade de telefone");
    expect(result.rows[2].issues).toContain("Telefone inválido ou ausente");
  });
  it("lê números XLSX e usa a primeira coluna de telefone válida", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Leads");
    sheet.addRow(["Nome", "WhatsApp", "Celular"]);
    sheet.addRow(["Pessoa de teste", "123", 69999991234]);
    const parsed = await parseFile(
      "teste.xlsx",
      Buffer.from(await book.xlsx.writeBuffer()),
    );
    const result = analyzeRows(parsed.records, {
      name: "Nome",
      phone: ["WhatsApp", "Celular"],
    });
    expect(result.report.valid).toBe(1);
    expect(result.rows[0].phone).toBe("5569999991234");
  });
});
