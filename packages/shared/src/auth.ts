import { z } from "zod";
import { gameSchema, text } from "./common.js";
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
    password: z.string().min(12).max(128),
    role: z.enum(["PLAYER", "ORGANIZER"]).default("PLAYER"),
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

export const emailSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
  })
  .strict();
export const tokenSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const resetSchema = tokenSchema.extend({ password: z.string().min(12).max(128) }).strict();
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().max(128).optional(),
    password: z.string().min(12).max(128),
  })
  .strict();
export const reauthenticateSchema = z.object({ password: z.string().min(1).max(128) }).strict();
export const profileSchema = z
  .object({
    username: registerSchema.shape.username.optional(),
    region: text(0, 80).optional(),
    gamesPlayed: z
      .array(gameSchema)
      .max(6)
      .refine((v) => new Set(v).size === v.length, "Choose each game once.")
      .optional(),
    socialLinks: z
      .array(
        z
          .string()
          .trim()
          .url()
          .max(300)
          .refine((v) => {
            const u = new URL(v);
            return u.protocol === "https:" && !u.username && !u.password;
          }, "Use an HTTPS link without credentials."),
      )
      .max(5)
      .optional(),
    profilePublic: z.boolean().optional(),
    showHistory: z.boolean().optional(),
    showTeams: z.boolean().optional(),
    displayName: z.string().trim().max(80),
    bio: z.string().trim().max(500),
    role: z.enum(["PLAYER", "ORGANIZER"]),
  })
  .strict();
