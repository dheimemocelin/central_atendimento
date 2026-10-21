import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { User } from "@prisma/client";
import { db } from "./db.js";
import { DomainError } from "./domain.js";
const scrypt = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export const secret = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt);
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [, salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const hash = await scrypt(password, salt);
  const bytes = Buffer.from(expected, "hex");
  return bytes.length === hash.length && timingSafeEqual(bytes, hash);
}
export const publicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active,
});
declare module "fastify" {
  interface FastifyRequest {
    actor: User;
  }
}
export async function authenticate(req: FastifyRequest) {
  const token = req.cookies.crm_session;
  if (!token) throw new DomainError("Entre para continuar.", 401);
  const session = await db.session.findUnique({
    where: { id: digest(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active)
    throw new DomainError("Sua sessão expirou. Entre novamente.", 401);
  req.actor = session.user;
}
