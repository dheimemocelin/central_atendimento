import "dotenv/config";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
export default async function teardown() {
  const path = ".scratch/e2e-schema.txt";
  if (!existsSync(path)) return;
  const schema = readFileSync(path, "utf8");
  if (!/^crm_e2e_\d+$/.test(schema))
    throw new Error("Schema de teste inválido.");
  const db = new PrismaClient();
  try {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    unlinkSync(path);
  } finally {
    await db.$disconnect();
  }
}
