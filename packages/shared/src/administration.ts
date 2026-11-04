import { z } from "zod";
export const caseInput = z
  .object({
    targetType: z.enum(["USER", "TEAM", "TOURNAMENT", "ORGANIZATION", "SUPPORT"]),
    targetId: z.string().min(1).max(100).optional(),
    category: z.enum(["ABUSE", "FRAUD", "SPAM", "OTHER", "SUPPORT"]),
    description: z.string().trim().min(10).max(4000),
  })
  .strict()
  .refine(
    (v) =>
      v.targetType === "SUPPORT"
        ? !v.targetId && v.category === "SUPPORT"
        : Boolean(v.targetId) && v.category !== "SUPPORT",
    "Select a valid report target.",
  );
export const reviewInput = z
  .object({
    action: z.enum([
      "REVIEW",
      "RESOLVE",
      "DISMISS",
      "SUSPEND",
      "RESTORE_ACCOUNT",
      "RESTRICT",
      "RESTORE_CONTENT",
    ]),
    reason: z.string().trim().min(10).max(2000),
    resolution: z.string().trim().max(2000).default(""),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export const adminQuery = z
  .object({
    q: z.string().trim().max(100).default(""),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    status: z.enum(["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"]).optional(),
  })
  .strict();
export const otpInput = z.object({ otp: z.string().regex(/^(\d{6}|[a-f0-9]{32})$/) }).strict();
