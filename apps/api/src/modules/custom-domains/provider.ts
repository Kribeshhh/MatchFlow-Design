import { z } from "zod";
import { env } from "../../config/env.js";
import { ApiError } from "../../database/client.js";
const record = z.object({
  name: z.string().max(253),
  type: z.enum(["TXT", "CNAME"]),
  value: z.string().max(2048),
});
export type DNSRecord = z.infer<typeof record>;
export type DomainState = {
  id: string;
  hostname: string;
  status: string;
  certificateStatus: string;
  records: DNSRecord[];
};
export type DomainProvider = {
  find: (hostname: string) => Promise<DomainState | null>;
  create: (hostname: string) => Promise<DomainState>;
  remove: (id: string) => Promise<void>;
};
export const domainAvailable = () =>
  Boolean(
    env.CLOUDFLARE_API_TOKEN &&
    env.CLOUDFLARE_ZONE_ID &&
    env.PORTAL_CNAME_TARGET &&
    env.PORTAL_ORIGIN_SECRET,
  );
const resultSchema = z.object({
  id: z.string().uuid(),
  hostname: z.string().max(253),
  status: z.string().max(64).optional(),
  ownership_verification: z
    .object({ name: z.string(), type: z.string(), value: z.string() })
    .optional(),
  ssl: z
    .object({
      status: z.string().max(64).optional(),
      validation_records: z
        .array(
          z.object({
            txt_name: z.string().optional(),
            txt_value: z.string().optional(),
            txt_record: z.string().optional(),
            cname_target: z.string().optional(),
            cname: z.string().optional(),
          }),
        )
        .max(20)
        .optional(),
    })
    .optional(),
});
function state(raw: unknown): DomainState {
  const r = resultSchema.parse(raw),
    records: DNSRecord[] = [];
  if (r.ownership_verification)
    records.push(
      record.parse({
        ...r.ownership_verification,
        type: r.ownership_verification.type.toUpperCase(),
      }),
    );
  for (const v of r.ssl?.validation_records || []) {
    if (v.txt_name && (v.txt_value || v.txt_record))
      records.push(
        record.parse({ name: v.txt_name, type: "TXT", value: v.txt_value || v.txt_record }),
      );
    if (v.cname && v.cname_target)
      records.push(record.parse({ name: v.cname, type: "CNAME", value: v.cname_target }));
  }
  return {
    id: r.id,
    hostname: r.hostname.toLowerCase(),
    status: r.status || "pending",
    certificateStatus: r.ssl?.status || "pending",
    records,
  };
}
export function cloudflareProvider(transport: typeof fetch = fetch): DomainProvider {
  async function call(path: string, method = "GET", body?: object) {
    if (!domainAvailable()) throw new ApiError(503, "Custom-domain hosting is not configured.");
    try {
      const response = await transport(
        `https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/custom_hostnames${path}`,
        {
          method,
          redirect: "error",
          headers: {
            Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(10000),
        },
      );
      if (method === "DELETE" && response.status === 404) return null;
      if (!response.ok || !response.body) throw Error("provider");
      const reader = response.body.getReader();
      let bytes = 0;
      const chunks: Uint8Array[] = [];
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.length;
        if (bytes > 131072) {
          await reader.cancel();
          throw Error("oversize");
        }
        chunks.push(part.value);
      }
      const envelope = z
        .object({ success: z.literal(true), result: z.unknown() })
        .parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      return envelope.result;
    } catch {
      throw new ApiError(503, "Custom-domain provider is unavailable. Retry later.");
    }
  }
  return {
    find: async (name) => {
      const rows = z
        .array(z.unknown())
        .max(50)
        .parse(await call(`?hostname=${encodeURIComponent(name)}&per_page=50`));
      const matches = rows.map(state).filter((r) => r.hostname === name);
      if (matches.length > 1)
        throw new ApiError(503, "Conflicting provider configuration requires operator review.");
      return matches[0] || null;
    },
    create: async (name) =>
      state(
        await call("", "POST", {
          hostname: name,
          ssl: { method: "txt", type: "dv", settings: { min_tls_version: "1.2" } },
        }),
      ),
    remove: async (id) => {
      z.string().uuid().parse(id);
      await call(`/${id}`, "DELETE");
    },
  };
}
