import "dotenv/config";
import { spawnSync } from "node:child_process";
if (
  !process.env.DATABASE_URL ||
  new URL(process.env.DATABASE_URL).pathname !== "/crm_demo"
) {
  throw new Error(
    "Migrations recusadas: configure o banco dedicado crm_demo.",
  );
}
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
