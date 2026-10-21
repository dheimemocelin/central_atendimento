import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./security.js";
describe("senhas", () => {
  it("usa sal independente, valida a senha e rejeita senha diferente", async () => {
    const a = await hashPassword("senha temporária de teste");
    const b = await hashPassword("senha temporária de teste");
    expect(a).not.toBe(b);
    expect(await verifyPassword("senha temporária de teste", a)).toBe(true);
    expect(await verifyPassword("outra senha", a)).toBe(false);
  });
});
