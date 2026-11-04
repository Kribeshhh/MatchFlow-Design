import { z } from "zod";
import { engineRulesSchema } from "./engine.js";
import { resultSchema } from "./matches.js";
export const battleViewSchema = z.object({
  rules: engineRulesSchema.shape.battle.unwrap(),
  participants: z.array(z.object({ id: z.string(), name: z.string() })),
  rounds: z.array(
    z.object({
      id: z.string(),
      number: z.number(),
      status: z.string(),
      participantIds: z.array(z.string()),
      isTiebreak: z.boolean(),
      version: z.number(),
      scheduledAt: z.string().nullable(),
      slotMinutes: z.number(),
      venue: z.string(),
      results: z.array(
        z.object({
          teamId: z.string(),
          placement: z.number().nullable(),
          eliminations: z.number(),
          noShow: z.boolean(),
        }),
      ),
    }),
  ),
  standings: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      points: z.number(),
      placementPoints: z.number(),
      eliminations: z.number(),
      wins: z.number(),
      played: z.number(),
      lastPlacement: z.number().nullable(),
    }),
  ),
});
const dispute = z.object({
  id: z.string(),
  matchId: z.string().nullable(),
  battleRoundId: z.string().nullable(),
  reason: z.string(),
  status: z.string(),
  resolution: z.string().nullable(),
  createdAt: z.string(),
});
const report = z.object({
  id: z.string(),
  matchId: z.string(),
  payload: resultSchema,
  status: z.string(),
  createdAt: z.string(),
});
export const engineActivitySchema = z.object({
  disputes: z.array(dispute),
  reports: z.array(report),
  history: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      evidence: z.array(z.string()),
      reason: z.string().nullable(),
      matchId: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  nextCursor: z.string().nullable().optional(),
});
export const correctionPreviewSchema = z.object({
  previewHash: z.string(),
  affectedMatches: z.array(
    z.object({
      id: z.string(),
      round: z.number(),
      bracket: z.string(),
      status: z.string(),
      teamAId: z.string().nullable(),
      teamBId: z.string().nullable(),
    }),
  ),
  affectedRounds: z.array(z.object({ id: z.string(), number: z.number(), status: z.string() })),
  voidedResults: z.number(),
  championWillBeRecomputed: z.boolean(),
});
export type BattleView = z.infer<typeof battleViewSchema>;
export type EngineActivity = z.infer<typeof engineActivitySchema>;
export type CorrectionPreview = z.infer<typeof correctionPreviewSchema>;
