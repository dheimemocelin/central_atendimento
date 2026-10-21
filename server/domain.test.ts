import { describe, expect, it } from "vitest";
import {
  assertPortfolio,
  businessDay,
  dateBound,
  distribute,
  initialStages,
  normalizePhone,
  rate,
  requireAdmin,
  validateTransition,
} from "./domain.js";
describe("carteira e autorização", () => {
  it("freelancer só acessa seu responsável atual", () => {
    expect(() =>
      assertPortfolio({ id: "ana", role: "FREELANCER" }, "bia"),
    ).toThrow("não encontrado");
    expect(() =>
      assertPortfolio({ id: "ana", role: "FREELANCER" }, "ana"),
    ).not.toThrow();
    expect(() => requireAdmin({ id: "ana", role: "FREELANCER" })).toThrow(
      "administrador",
    );
  });
});
describe("transições comerciais", () => {
  it("permite iniciar atendimento diretamente de um lead novo", () => {
    const target = {
      ...initialStages.find((s) => s.id === "active")!,
      active: true,
    };
    expect(target.allowedFrom).toContain("new");
    expect(() =>
      validateTransition({
        current: { id: "new", kind: "OPEN" },
        target,
        role: "FREELANCER",
        hasPendingTask: false,
      }),
    ).not.toThrow();
  });
  const current = { id: "active", kind: "OPEN" };
  const move = (id: string, extras = {}) =>
    validateTransition({
      current,
      target: { ...initialStages.find((s) => s.id === id)!, active: true },
      role: "FREELANCER",
      hasPendingTask: false,
      ...extras,
    });
  it("exige retorno pendente antes da etapa de espera", () => {
    expect(() => move("waiting")).toThrow("Agende um retorno");
    expect(() => move("waiting", { hasPendingTask: true })).not.toThrow();
  });
  it("não permite perda ou conversão sem dados", () => {
    expect(() => move("lost")).toThrow("motivo");
    expect(() => move("won")).toThrow("conversão");
    expect(() => move("won", { conversion: "Proposta aceita" })).not.toThrow();
  });
  it("reabertura exige administrador e justificativa", () => {
    expect(() =>
      move("active", { current: { id: "lost", kind: "LOST" } }),
    ).toThrow("Reabertura");
    expect(() =>
      move("active", {
        current: { id: "lost", kind: "LOST" },
        role: "ADMIN",
        reason: "Cliente retomou contato",
      }),
    ).not.toThrow();
  });
});
describe("distribuição auditável", () => {
  it("produz 24/24 com 48 entradas e ordem explícita", () => {
    const result = distribute(
      Array.from({ length: 48 }, (_, i) => i),
      ["ana", "bia"],
    );
    expect(result.filter((r) => r.ownerId === "ana")).toHaveLength(24);
    expect(result.filter((r) => r.ownerId === "bia")).toHaveLength(24);
    expect(result.slice(0, 3)).toEqual([
      { lead: 0, ownerId: "ana" },
      { lead: 1, ownerId: "bia" },
      { lead: 2, ownerId: "ana" },
    ]);
  });
  it("quantidade ímpar não inventa nem perde leads", () => {
    const result = distribute(["a", "b", "c"], ["ana", "bia"]);
    expect(result).toHaveLength(3);
    expect(result.filter((r) => r.ownerId === "ana")).toHaveLength(2);
    expect(() => distribute([1], ["ana", "ana"])).toThrow();
  });
});
describe("telefones e tempo comercial", () => {
  it("normaliza números brasileiros sem inventar dígitos ausentes", () => {
    expect(normalizePhone("(69) 99999-1234")).toBe("5569999991234");
    expect(normalizePhone("+55 69 3222-1234")).toBe("556932221234");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("(69) 8888-1234")).toBeNull();
  });
  it("identifica o dia anterior antes das 04h UTC", () => {
    expect(businessDay(new Date("2026-10-20T03:59:59Z"))).toBe("2026-10-19");
    expect(dateBound("2026-10-20").toISOString()).toBe(
      "2026-10-20T04:00:00.000Z",
    );
    expect(dateBound("2026-10-20", true).toISOString()).toBe(
      "2026-10-21T04:00:00.000Z",
    );
    expect(() => dateBound("2026-02-31")).toThrow();
  });
  it("define taxas e denominador zero", () => {
    expect(rate(2, 4)).toBe(0.5);
    expect(rate(0, 0)).toBe(0);
  });
});
