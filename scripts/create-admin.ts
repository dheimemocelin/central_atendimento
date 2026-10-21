import "dotenv/config";
import { z } from "zod";
import { db } from "../server/db.js";
import { hashPassword } from "../server/security.js";
import { initializeCatalogs } from "../server/catalogs.js";
const input = z
  .object({
    ADMIN_NAME: z.string().min(2),
    ADMIN_EMAIL: z.email(),
    ADMIN_PASSWORD: z.string().min(12).max(128),
  })
  .parse(process.env);
try {
  await db.$transaction(async (tx) => {
    if (await tx.user.count({ where: { role: "ADMIN" } }))
      throw new Error(
        "Administrador já existe. Use o fluxo de usuários; este comando não redefine credenciais.",
      );
    await initializeCatalogs(tx);
    const user = await tx.user.create({
      data: {
        name: input.ADMIN_NAME,
        email: input.ADMIN_EMAIL.toLowerCase(),
        passwordHash: await hashPassword(input.ADMIN_PASSWORD),
        role: "ADMIN",
      },
    });
    await tx.leadEvent.create({
      data: { userId: user.id, type: "ADMIN_PROVISIONED", data: {} },
    });
  });
  console.log("Administrador criado. Remova ADMIN_PASSWORD do ambiente.");
} finally {
  await db.$disconnect();
}
