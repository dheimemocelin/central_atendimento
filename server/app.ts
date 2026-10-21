import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { ZodError } from "zod";
import { config } from "./config.js";
import { DomainError } from "./domain.js";
import { registerAuth } from "./routes/auth.js";
import { registerLeads } from "./routes/leads.js";
import { registerAdmin } from "./routes/admin.js";
import { registerReports } from "./routes/reports.js";
import { db } from "./db.js";
export async function buildApp() {
  const app = Fastify({
    bodyLimit: 16 * 1024 * 1024,
    trustProxy: "127.0.0.1",
    logger: {
      redact: [
        "req.headers.cookie",
        "req.headers.authorization",
        "res.headers.set-cookie",
      ],
      serializers: {
        req: (req) => ({ method: req.method, url: req.url?.split("?")[0] }),
      },
    },
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: [config.FRAME_ANCESTOR || "'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    frameguard: false,
    hsts: config.NODE_ENV === "production" ? { maxAge: 31536000 } : false,
  });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.url.startsWith("/api/")
    ) {
      if (
        req.headers.origin !== config.APP_ORIGIN ||
        req.headers["x-crm-request"] !== "1"
      )
        throw new DomainError("Origem da solicitação não autorizada.", 403);
    }
  });
  app.setErrorHandler(
    (error: Error & { code?: string; statusCode?: number }, req, reply) => {
      if (error instanceof ZodError)
        return reply.code(400).send({
          message: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
      if (error instanceof DomainError)
        return reply.code(error.statusCode).send({ message: error.message });
      if (error.code === "P2002")
        return reply.code(409).send({ message: "Este registro já existe." });
      if (error.code === "P2025")
        return reply.code(404).send({ message: "Registro não encontrado." });
      if (error.code === "P2034")
        return reply.code(409).send({
          message: "Outra alteração ocorreu. Atualize e tente novamente.",
        });
      if (error.statusCode && error.statusCode < 500)
        return reply.code(error.statusCode).send({
          message:
            error.statusCode === 429
              ? "Muitas solicitações. Aguarde e tente novamente."
              : "Solicitação inválida.",
        });
      req.log.error(
        { code: error.code, errorType: error.name },
        "request_failed",
      );
      return reply.code(503).send({
        message:
          "Não foi possível concluir. Verifique a conexão com o banco e tente novamente.",
      });
    },
  );
  app.get("/api/health", async () => {
    await db.$queryRaw`SELECT 1`;
    return { status: "ok" };
  });
  await registerAuth(app);
  await registerLeads(app);
  await registerAdmin(app);
  await registerReports(app);
  const root = resolve("dist/web");
  if (existsSync(root)) {
    await app.register(staticFiles, { root });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ message: "Rota não encontrada." })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
