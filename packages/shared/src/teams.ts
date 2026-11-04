import { z } from "zod";
import { gameSchema, text } from "./common.js";
export const teamSchema = z
  .object({
    name: text(3, 60),
    game: gameSchema,
    region: text(0, 80).default(""),
    description: text(0, 500).default(""),
    logoUrl: z
      .union([z.literal(""), z.null()])
      .optional()
      .transform(() => undefined),
  })
  .strict();
