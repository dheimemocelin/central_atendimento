import { describe, expect, it } from "vitest";
import { demoLeads } from "../scripts/demo-data.js";
describe("base demonstrativa segura", () => {
  it("usa contatos sem telefones acionáveis e e-mails reservados", () => {
    const leads = demoLeads();
    expect(leads).toHaveLength(48);
    expect(
      leads.every(
        (lead) =>
          lead.phone === null && lead.email.endsWith("@example.invalid"),
      ),
    ).toBe(true);
    expect(new Set(leads.map((lead) => lead.id)).size).toBe(48);
  });
  it("distribui 24 contatos por atendente e oito por etapa", () => {
    const leads = demoLeads();
    for (const owner of ["demo-agent-a", "demo-agent-b"])
      expect(leads.filter((lead) => lead.ownerId === owner)).toHaveLength(24);
    for (const stage of ["new", "attempt", "active", "waiting", "won", "lost"])
      expect(leads.filter((lead) => lead.stageId === stage)).toHaveLength(8);
  });
});
