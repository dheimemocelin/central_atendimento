import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import {
  authenticate,
  digest,
  hashPassword,
  publicUser,
  secret,
  verifyPassword,
} from "../security.js";
import { config } from "../config.js";
import { DomainError } from "../domain.js";
const password = z
  .string()
  .min(12, "Utilize pelo menos 12 caracteres.")
  .max(128);
export async function registerAuth(app: FastifyInstance) {
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const input = z
        .object({ email: z.email(), password: z.string().min(1).max(128) })
        .parse(req.body);
      const user = await db.user.findUnique({
        where: { email: input.email.toLowerCase() },
      });
      // Keep password verification work even when the address does not exist.
      const valid = await verifyPassword(
        input.password,
        user?.passwordHash || `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`,
      );
      if (!user || !user.active || !valid)
        throw new DomainError("E-mail ou senha inválidos.", 401);
      const token = secret();
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
        const current = await tx.user.findUnique({ where: { id: user.id } });
        if (!current?.active || current.passwordHash !== user.passwordHash)
          throw new DomainError("O acesso mudou. Entre novamente.", 401);
        await tx.session.create({
          data: {
            id: digest(token),
            userId: user.id,
            expiresAt: new Date(Date.now() + config.SESSION_HOURS * 3600000),
          },
        });
        await tx.leadEvent.create({
          data: { userId: user.id, type: "LOGIN", data: {} },
        });
      });
      reply.setCookie("crm_session", token, {
        path: "/",
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: config.COOKIE_SAME_SITE,
        maxAge: config.SESSION_HOURS * 3600,
      });
      return publicUser(user);
    },
  );
  app.get("/api/auth/me", { preHandler: authenticate }, async (req) =>
    publicUser(req.actor),
  );
  app.post("/api/auth/logout", async (req, reply) => {
    if (req.cookies.crm_session)
      await db.session.deleteMany({
        where: { id: digest(req.cookies.crm_session) },
      });
    reply.clearCookie("crm_session", { path: "/" });
    return { ok: true };
  });
  app.post(
    "/api/auth/reset",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req) => {
      const input = z
        .object({ token: z.string().min(20).max(200), password })
        .parse(req.body);
      const passwordHash = await hashPassword(input.password);
      await db.$transaction(async (tx) => {
        const reset = await tx.passwordReset.findUnique({
          where: { id: digest(input.token) },
          include: { user: true },
        });
        if (!reset || !reset.user.active)
          throw new DomainError("Código inválido ou expirado.");
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${reset.userId} FOR UPDATE`;
        if (
          !(await tx.user.findFirst({
            where: { id: reset.userId, active: true },
          }))
        )
          throw new DomainError("Código inválido ou expirado.");
        const claimed = await tx.passwordReset.updateMany({
          where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (!claimed.count)
          throw new DomainError("Código inválido ou expirado.");
        await tx.user.update({
          where: { id: reset.userId },
          data: { passwordHash },
        });
        await tx.session.deleteMany({ where: { userId: reset.userId } });
        await tx.leadEvent.create({
          data: { userId: reset.userId, type: "PASSWORD_RESET", data: {} },
        });
      });
      return { ok: true };
    },
  );
}
