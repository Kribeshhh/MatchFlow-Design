import { z } from "zod";
export const engineRulesSchema = z
  .object({
    noShowGraceMinutes: z.number().int().min(0).max(120).optional(),
    groups: z
      .object({
        count: z.union([z.literal(2), z.literal(4), z.literal(8)]),
        advance: z.union([z.literal(1), z.literal(2)]),
      })
      .strict()
      .optional(),
    league: z
      .object({
        cycles: z.union([z.literal(1), z.literal(2)]),
        winPoints: z.number().int().min(1).max(100),
        drawPoints: z.number().int().min(0).max(100),
        lossPoints: z.number().int().min(0).max(100),
        allowDraws: z.boolean(),
      })
      .strict()
      .refine(
        (v) => v.winPoints > v.drawPoints && v.drawPoints >= v.lossPoints,
        "Points must satisfy win > draw >= loss.",
      )
      .optional(),
    battle: z
      .object({
        rounds: z.number().int().min(1).max(32),
        placementPoints: z.array(z.number().int().min(0).max(10000)).min(1).max(64),
        eliminationPoints: z.number().int().min(0).max(1000),
        tieBreakers: z
          .array(z.enum(["WINS", "ELIMINATIONS", "PLACEMENT_POINTS", "LAST_ROUND_PLACEMENT"]))
          .min(1)
          .max(4),
      })
      .strict()
      .superRefine((v, ctx) => {
        if (
          new Set(v.tieBreakers).size !== v.tieBreakers.length ||
          v.tieBreakers.at(-1) !== "LAST_ROUND_PLACEMENT"
        )
          ctx.addIssue({
            code: "custom",
            message:
              "Use unique tie-breakers ending with last-round placement to resolve equal points.",
          });
        if (v.placementPoints.some((n, i) => i > 0 && n > v.placementPoints[i - 1]))
          ctx.addIssue({
            code: "custom",
            message: "Placement points must not increase for lower placements.",
          });
        if (!v.eliminationPoints && !v.placementPoints.some((n) => n > 0))
          ctx.addIssue({
            code: "custom",
            message: "Configure positive placement or elimination points.",
          });
      })
      .optional(),
  })
  .strict();
export type EngineRules = z.infer<typeof engineRulesSchema>;
