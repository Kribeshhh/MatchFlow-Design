import { z } from "zod";
import { text } from "./common.js";
export const matchStatisticsSchema = z
  .object({
    killsA: z.number().int().min(0).max(100000),
    deathsA: z.number().int().min(0).max(100000),
    assistsA: z.number().int().min(0).max(100000),
    killsB: z.number().int().min(0).max(100000),
    deathsB: z.number().int().min(0).max(100000),
    assistsB: z.number().int().min(0).max(100000),
    durationSeconds: z.number().int().min(1).max(86400),
  })
  .strict();
export const resultSchema = z
  .object({
    scoreA: z.number().int().min(0).max(999).optional(),
    scoreB: z.number().int().min(0).max(999).optional(),
    statistics: matchStatisticsSchema.optional(),
    outcome: z.enum(["PLAYED", "DRAW", "FORFEIT", "NO_SHOW"]).default("PLAYED"),
    winnerId: z.string().min(1).max(100).optional(),
    reason: text(0, 2000).default(""),
    expectedVersion: z.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      ["PLAYED", "DRAW"].includes(v.outcome) &&
      (v.scoreA === undefined || v.scoreB === undefined)
    )
      ctx.addIssue({ code: "custom", message: "Enter both scores." });
    if (
      ["FORFEIT", "NO_SHOW"].includes(v.outcome) &&
      (!v.winnerId ||
        v.reason.length < 10 ||
        v.statistics ||
        v.scoreA !== undefined ||
        v.scoreB !== undefined)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Forfeits and no-shows need a winner and reason, with no invented score or statistics.",
      });
  });
export type ResultInput = z.infer<typeof resultSchema>;
export const scheduleSchema = z
  .object({
    scheduledAt: z.string().datetime(),
    slotMinutes: z.number().int().min(1).max(480).default(60),
    venue: text(0, 200).default(""),
  })
  .strict();
