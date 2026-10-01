import { z } from "zod";
export const gameSchema = z.enum([
  "pubg",
  "ml",
  "ff",
  "cs2",
  "valorant",
  "dota",
]);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const registerSchema = z
  .object({
    username: text(3, 24)
      .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, or underscores.")
      .transform((v) => v.toLowerCase()),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(10).max(128),
    role: z.enum(["PLAYER", "ORGANIZER"]),
  })
  .strict();
export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();
export const teamSchema = z
  .object({
    name: text(3, 60),
    game: gameSchema,
    description: text(0, 500).default(""),
    logoUrl: z
      .union([
        z.literal(""),
        z
          .string()
          .url()
          .max(500)
          .refine((v) => v.startsWith("https://"), "Logo URL must use HTTPS."),
      ])
      .nullable()
      .optional()
      .transform((v) => v || null),
  })
  .strict();
export const tournamentSchema = z
  .object({
    name: text(3, 100),
    game: gameSchema,
    description: text(10, 5000),
    rules: text(10, 5000),
    teamSize: z.number().int().min(1).max(10),
    maxTeams: z.number().int().min(2).max(64),
    opensAt: z.string().datetime(),
    closesAt: z.string().datetime(),
    startsAt: z.string().datetime(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!(v.opensAt < v.closesAt && v.closesAt <= v.startsAt))
      ctx.addIssue({
        code: "custom",
        message:
          "Registration must open before closing, and close by the tournament start.",
        path: ["closesAt"],
      });
    if (new Date(v.startsAt).getTime() <= Date.now())
      ctx.addIssue({
        code: "custom",
        message: "Tournament start must be in the future.",
        path: ["startsAt"],
      });
  });
export const idBody = z.object({ teamId: text(1, 100) }).strict();
export const memberSchema = z.object({ userId: text(1, 100) }).strict();
export const reviewSchema = z
  .object({ status: z.enum(["APPROVED", "REJECTED"]) })
  .strict();
export const resultSchema = z
  .object({
    scoreA: z.number().int().min(0).max(999),
    scoreB: z.number().int().min(0).max(999),
  })
  .strict()
  .refine(
    (v) => v.scoreA !== v.scoreB,
    "Elimination matches cannot end in a tie.",
  );
export const scheduleSchema = z
  .object({
    scheduledAt: z.string().datetime(),
    venue: text(0, 200).default(""),
  })
  .strict();
