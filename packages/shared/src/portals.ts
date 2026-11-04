import { z } from "zod";
export function contrastOnCharcoal(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((h) => {
      const n = parseInt(h, 16) / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] + 0.05) / 0.0575;
}
export const portalSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]{2,48}[a-z0-9]$/),
    enabled: z.boolean(),
    title: z.string().trim().min(2).max(100),
    intro: z.string().trim().max(1200),
    accent: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .refine(
        (v) => contrastOnCharcoal(v) >= 4.5,
        "Choose a lighter accent with readable contrast.",
      )
      .transform((v) => v.toUpperCase()),
    navigation: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(24),
            target: z.enum(["HOME", "TOURNAMENTS", "RESULTS"]),
          })
          .strict(),
      )
      .max(3)
      .refine(
        (items) => new Set(items.map((i) => i.target)).size === items.length,
        "Use each navigation destination once.",
      ),
    hideAttribution: z.boolean().default(false),
    expectedVersion: z.number().int().nonnegative().optional(),
  })
  .strict();
export type PortalInput = z.infer<typeof portalSchema>;
export const domainInput = z.object({ hostname: z.string().trim().min(4).max(253) }).strict();
export const portalListQuery = z
  .object({
    q: z.string().trim().max(100).default(""),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    completed: z.enum(["true", "false"]).optional(),
  })
  .strict();
