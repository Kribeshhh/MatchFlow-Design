import { z } from "zod";
import { idSchema } from "./common.js";
export const bracketGenerationSchema = z
  .object({
    seeding: z.enum(["REGISTRATION", "RANDOM", "MANUAL"]).default("REGISTRATION"),
    teamIds: z.array(idSchema).min(2).max(64).optional(),
  })
  .strict()
  .refine(
    (input) => (input.seeding === "MANUAL" ? Boolean(input.teamIds) : !input.teamIds),
    "Supply the full participant order only for manual seeding.",
  );
