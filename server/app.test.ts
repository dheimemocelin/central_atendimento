import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { FastifyInstance } from "fastify";
describe("fronteira HTTP sem sessão", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => app.close());
  it("recusa leitura e alteração de carteira sem autenticação", async () => {
    expect((await app.inject({ url: "/api/leads" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/tasks" })).statusCode).toBe(401);
  });
  it("recusa mutações vindas de origem indevida", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { origin: "https://site-invasor.test", "x-crm-request": "1" },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
  });
  it("bloqueia incorporação quando nenhuma origem foi configurada", async () => {
    const response = await app.inject({ url: "/api/auth/me" });
    expect(response.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers["x-frame-options"]).toBeUndefined();
  });
});
