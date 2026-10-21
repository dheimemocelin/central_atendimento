import "dotenv/config";
import { PrismaClient } from "@prisma/client";
if (
  process.env.DATABASE_URL &&
  !/^\/crm_demo(?:_restore_[a-z0-9_]+)?$/.test(
    new URL(process.env.DATABASE_URL).pathname,
  )
) {
  throw new Error("A aplicação exige o banco dedicado crm_demo.");
}
export const db = new PrismaClient();
