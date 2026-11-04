import { z } from "zod";
export const apiScopes = [
  "tournaments:read",
  "registrations:read",
  "matches:read",
  "announcements:write",
  "schedules:write",
] as const;
export const webhookEvents = [
  "tournament.created",
  "registration.approved",
  "match.scheduled",
  "match.completed",
  "bracket.updated",
  "tournament.completed",
  "announcement.created",
] as const;
export const integrationSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    scopes: z.array(z.enum(apiScopes)).min(1).max(5),
    tournamentIds: z.array(z.string().cuid()).max(100).default([]),
  })
  .strict();
export const credentialSchema = z
  .object({
    expiresInDays: z.number().int().min(1).max(365).default(90),
    rotateId: z.string().cuid().optional(),
  })
  .strict();
export const webhookSchema = z
  .object({ url: z.string().url().max(2048), events: z.array(z.enum(webhookEvents)).min(1).max(7) })
  .strict();
export const apiPageSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(25),
    after: z.string().cuid().optional(),
  })
  .strict();
export const apiAnnouncementSchema = z
  .object({ title: z.string().trim().min(3).max(160), body: z.string().trim().min(3).max(4000) })
  .strict();
export const apiScheduleSchema = z
  .object({
    scheduledAt: z.string().datetime(),
    venue: z.string().trim().max(160).default(""),
    slotMinutes: z.number().int().min(1).max(480).default(60),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export type IntegrationInput = z.infer<typeof integrationSchema>;
export type ApiScope = (typeof apiScopes)[number];
