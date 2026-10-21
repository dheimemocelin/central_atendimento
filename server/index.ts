import { buildApp } from "./app.js";
import { config } from "./config.js";
import { db } from "./db.js";
const app = await buildApp();
await app.listen({ host: "127.0.0.1", port: config.PORT });
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, async () => {
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
