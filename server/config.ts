import "dotenv/config";
import { z } from "zod";
export const config = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_ORIGIN: z.url().default("http://127.0.0.1:5173"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    COOKIE_SAME_SITE: z.enum(["lax", "none", "strict"]).default("lax"),
    SESSION_HOURS: z.coerce.number().int().min(1).max(48).default(12),
    FRAME_ANCESTOR: z
      .url()
      .refine(
        (value) => new URL(value).protocol === "https:",
        "A origem de incorporação deve usar HTTPS.",
      )
      .optional(),
  })
  .parse(process.env);
if (
  config.NODE_ENV === "production" &&
  !config.APP_ORIGIN.startsWith("https://")
)
  throw new Error("APP_ORIGIN deve utilizar HTTPS em produção.");
if (config.NODE_ENV !== "production" && config.COOKIE_SAME_SITE === "none")
  throw new Error("SameSite=None exige HTTPS em produção.");
