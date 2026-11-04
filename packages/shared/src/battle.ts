import { z } from "zod";
export const battleResultsSchema = z
  .object({
    expectedVersion: z.number().int().min(0).optional(),
    results: z
      .array(
        z
          .object({
            teamId: z.string().min(1).max(100),
            placement: z.number().int().min(1).max(64).nullable(),
            eliminations: z.number().int().min(0).max(1000),
            noShow: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(64),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.results.map((r) => r.teamId)).size !== v.results.length)
      ctx.addIssue({ code: "custom", message: "A participant can appear only once." });
    const present = v.results.filter((r) => !r.noShow),
      placements = present.map((r) => r.placement).sort((a, b) => (a ?? 0) - (b ?? 0));
    if (!present.length || placements.some((p, i) => p !== i + 1))
      ctx.addIssue({
        code: "custom",
        message: "Present participants need unique consecutive placements starting at 1.",
      });
    if (v.results.some((r) => r.noShow && (r.placement !== null || r.eliminations !== 0)))
      ctx.addIssue({
        code: "custom",
        message: "No-shows have no placement and zero eliminations.",
      });
  });
