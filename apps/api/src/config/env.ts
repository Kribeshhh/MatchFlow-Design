import "dotenv/config";
import { z } from "zod";
import ipaddr from "ipaddr.js";
import { isIP } from "node:net";
const origin = z
  .string()
  .url()
  .refine((s) => {
    const u = new URL(s);
    return ["http:", "https:"].includes(u.protocol) && u.origin === s;
  });
const schema = z
  .object({
    TRUSTED_PROXIES: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      )
      .pipe(
        z.array(
          z.string().refine((value) => {
            try {
              if (!value.includes("/")) return isIP(value) !== 0;
              if (!isIP(value.split("/")[0])) return false;
              const [, prefix] = ipaddr.parseCIDR(value);
              return prefix > 0;
            } catch {
              return false;
            }
          }, "Use explicit proxy IP addresses or bounded CIDRs, never blanket trust"),
        ),
      ),
    SUPPORT_CONTACT_EMAIL: z.string().email().optional(),
    STAFF_MFA_KEY: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    SUPPORT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
    MODERATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(365),
    AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(365),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z
      .string()
      .url()
      .refine((s) => ["postgres:", "postgresql:"].includes(new URL(s).protocol)),
    CLIENT_ORIGIN: z
      .string()
      .default("http://localhost:5173")
      .transform((s) => s.split(",").map((s) => s.trim()))
      .pipe(z.array(origin).min(1)),
    APP_ORIGIN: origin.default("http://localhost:5173"),
    S3_ENDPOINT: z
      .string()
      .url()
      .refine(
        (v) => new URL(v).protocol === "https:" && !new URL(v).username && !new URL(v).password,
        "Use HTTPS without URL credentials",
      )
      .optional(),
    S3_REGION: z.string().min(1).optional(),
    S3_BUCKET: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
      .optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    CLOUDFLARE_ZONE_ID: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    CLOUDFLARE_API_TOKEN: z.string().min(20).optional(),
    PORTAL_CNAME_TARGET: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/)
      .optional(),
    PORTAL_APEX_ADDRESSES: z
      .string()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    PORTAL_ORIGIN_SECRET: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    PORTAL_ALLOW_HIDE_ATTRIBUTION: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    WEBHOOK_ENCRYPTION_KEY: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().email().optional(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    NOTIFICATION_WORKER: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().min(1).default("127.0.0.1"),
    LOG_LEVEL: z
      .enum(["silent", "fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
  })
  .superRefine((v, ctx) => {
    const domains = [
      v.CLOUDFLARE_ZONE_ID,
      v.CLOUDFLARE_API_TOKEN,
      v.PORTAL_CNAME_TARGET,
      v.PORTAL_ORIGIN_SECRET,
    ];
    if (domains.some(Boolean) && !domains.every(Boolean))
      ctx.addIssue({
        code: "custom",
        path: ["CLOUDFLARE_ZONE_ID"],
        message: "Complete custom-domain configuration required",
      });
    const storage = [v.S3_REGION, v.S3_BUCKET, v.S3_ACCESS_KEY_ID, v.S3_SECRET_ACCESS_KEY];
    if (storage.some(Boolean) && !storage.every(Boolean))
      ctx.addIssue({
        code: "custom",
        path: ["S3_BUCKET"],
        message: "Complete S3 configuration required",
      });
    if (v.S3_ENDPOINT && !storage.every(Boolean))
      ctx.addIssue({
        code: "custom",
        path: ["S3_ENDPOINT"],
        message: "Complete S3 configuration required",
      });
    if (v.NODE_ENV === "production" && !v.APP_ORIGIN.startsWith("https://"))
      ctx.addIssue({ code: "custom", path: ["APP_ORIGIN"], message: "HTTPS required" });
    if (Boolean(v.SMTP_USER) !== Boolean(v.SMTP_PASSWORD))
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_USER"],
        message: "SMTP credentials must be paired",
      });
    if (Boolean(v.SMTP_HOST) !== Boolean(v.MAIL_FROM))
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "SMTP_HOST and MAIL_FROM must be paired",
      });
    if (Boolean(v.GOOGLE_CLIENT_ID) !== Boolean(v.GOOGLE_CLIENT_SECRET))
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message: "Google credentials must be paired",
      });
    if (v.NODE_ENV === "production" && v.CLIENT_ORIGIN.some((s) => !s.startsWith("https://")))
      ctx.addIssue({
        code: "custom",
        path: ["CLIENT_ORIGIN"],
        message: "Production requires HTTPS origins",
      });
  });
export function parseEnvironment(input: Record<string, unknown>) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid environment configuration: ${[...new Set(result.error.issues.map((i) => i.path[0]))].join(", ")}`,
    );
  return result.data;
}
export const env = parseEnvironment(process.env);
