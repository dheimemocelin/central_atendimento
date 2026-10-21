import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const source = process.env.DATABASE_URL!;
const url = new URL(source);
if (url.pathname !== "/crm_demo")
  throw new Error("Ensaio exige banco exclusivo crm_demo.");
const schema = `crm_backup_${Date.now()}`;
const base = new PrismaClient({ datasourceUrl: source });
const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
const args = [
  "--no-password",
  "--host=" + url.hostname,
  "--port=" + (url.port || "5432"),
  "--username=" + decodeURIComponent(url.username),
  "--dbname=crm_demo",
];
const pgBin = process.env.PG_BIN || "C:/Program Files/PostgreSQL/17/bin";
const run = (tool: string, extra: string[], pgOptions?: string) => {
  const res = spawnSync(`${pgBin}/${tool}.exe`, [...args, ...extra], {
    env: { ...env, ...(pgOptions ? { PGOPTIONS: pgOptions } : {}) },
    encoding: "utf8",
  });
  if (res.status !== 0)
    throw new Error(
      `Ensaio interrompido: ${tool} falhou. Nenhum banco externo foi alterado.`,
    );
};
url.searchParams.set("schema", schema);
const testDb = new PrismaClient({ datasourceUrl: url.toString() });
try {
  await base.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  run(
    "psql",
    [
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "prisma/migrations/202610200001_initial/migration.sql",
      "-f",
      "prisma/migrations/202610200002_lead_review/migration.sql",
      "-f",
      "prisma/migrations/202610200003_direct_contact/migration.sql",
    ],
    `-c search_path=${schema}`,
  );
  const { initializeCatalogs } = await import("../server/catalogs.js");
  await testDb.$transaction((tx) => initializeCatalogs(tx));
  const user = await testDb.user.create({
    data: {
      name: "Ensaio isolado",
      email: "backup@crm.test",
      role: "ADMIN",
      passwordHash: "inaccessible-test-fixture",
    },
  });
  const lead = await testDb.lead.create({
    data: { name: "Dado de ensaio de recuperação", ownerId: user.id },
  });
  await testDb.leadEvent.create({
    data: {
      userId: user.id,
      leadId: lead.id,
      type: "RESTORE_PROOF",
      data: { isolated: true },
    },
  });
  mkdirSync(".scratch/backups", { recursive: true });
  const file = `.scratch/backups/${schema}.dump`;
  run("pg_dump", ["--format=custom", `--schema=${schema}`, `--file=${file}`]);
  await testDb.$disconnect();
  await base.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  run("pg_restore", [
    "--exit-on-error",
    "--single-transaction",
    "--no-owner",
    "--no-acl",
    file,
  ]);
  const leads = await testDb.lead.findMany();
  const events = await testDb.leadEvent.findMany();
  if (
    leads.length !== 1 ||
    leads[0].id !== lead.id ||
    events.length !== 1 ||
    events[0].type !== "RESTORE_PROOF"
  )
    throw new Error(
      "Dados restaurados não reconciliam com a origem do ensaio.",
    );
  console.log(
    "Ensaio PostgreSQL: dump e restauração de schema isolado aprovados; lead e auditoria reconciliados. Não substitui homologação do serviço Windows ou restauração integral de produção.",
  );
} finally {
  await testDb.$disconnect();
  if (/^crm_backup_\d+$/.test(schema))
    await base.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await base.$disconnect();
}
