import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const original = process.env.DATABASE_URL!;
const url = new URL(original);
if (url.pathname !== "/crm_demo")
  throw new Error("E2E exige banco exclusivo crm_demo.");
const schema = `crm_e2e_${Date.now()}`;
const base = new PrismaClient({ datasourceUrl: original });
await base.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
mkdirSync(".scratch", { recursive: true });
writeFileSync(".scratch/e2e-schema.txt", schema);
const migration = spawnSync(
  process.env.PSQL_PATH || "C:/Program Files/PostgreSQL/17/bin/psql.exe",
  [
    "-w",
    "-v",
    "ON_ERROR_STOP=1",
    "-h",
    url.hostname,
    "-p",
    url.port || "5432",
    "-U",
    decodeURIComponent(url.username),
    "-d",
    "crm_demo",
    "-f",
    "prisma/migrations/202610200001_initial/migration.sql",
    "-f",
    "prisma/migrations/202610200002_lead_review/migration.sql",
    "-f",
    "prisma/migrations/202610200003_direct_contact/migration.sql",
  ],
  {
    env: {
      ...process.env,
      PGPASSWORD: decodeURIComponent(url.password),
      PGOPTIONS: `-c search_path=${schema}`,
    },
  },
);
if (migration.status !== 0) throw new Error("Falha ao preparar E2E.");
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.toString();
process.env.PORT = "5174";
process.env.API_PORT = "3101";
process.env.APP_ORIGIN = "http://127.0.0.1:5174";
process.env.NODE_ENV = "test";
const { db } = await import("../server/db.js");
const { initializeCatalogs } = await import("../server/catalogs.js");
const { hashPassword } = await import("../server/security.js");
await db.$transaction((tx) => initializeCatalogs(tx));
const passwordHash = await hashPassword("Acesso de teste 2026!");
await db.user.create({
  data: {
    name: "Administrador de teste",
    email: "admin@crm.test",
    role: "ADMIN",
    passwordHash,
  },
});
const a = await db.user.create({
  data: { name: "Freelancer A", email: "a@crm.test", passwordHash },
});
const b = await db.user.create({
  data: { name: "Freelancer B", email: "b@crm.test", passwordHash },
});
await db.lead.create({
  data: {
    name: "Dado de teste · Carteira A",
    ownerId: a.id,
    phone: "5569999991234",
    source: "Teste isolado",
  },
});
await db.lead.create({
  data: {
    name: "Dado de teste · Carteira B",
    ownerId: b.id,
    phone: "5569999995678",
    source: "Teste isolado",
  },
});
await db.lead.create({
  data: {
    name: "Lead de teste · Arraste",
    ownerId: a.id,
    phone: "5569999994321",
    source: "Teste isolado",
  },
});
const app = await (await import("../server/app.js")).buildApp();
await app.listen({ host: "127.0.0.1", port: 5174 });
async function close() {
  await app.close();
  await db.$disconnect();
  await base.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await base.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
