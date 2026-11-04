import { z } from "zod";
export const notificationKind = z.enum([
  "REGISTRATION",
  "SCHEDULE",
  "RESULT",
  "ANNOUNCEMENT",
  "CHECK_IN",
  "LIFECYCLE",
]);
export const preferenceSchema = z
  .object({
    inApp: z.boolean(),
    email: z.boolean(),
    mutedKinds: z
      .array(notificationKind)
      .max(6)
      .refine((v) => new Set(v).size === v.length, "Choose each category once."),
  })
  .strict();
export const subscribeSchema = z
  .object({
    tournamentId: z.string().min(1).max(100),
    version: z
      .string()
      .regex(/^\d{1,20}$/)
      .optional(),
  })
  .strict();
export const liveSignalSchema = z
  .object({
    topic: z.enum(["tournament", "notifications"]),
    id: z.string(),
    version: z.string().regex(/^\d{1,20}$/),
    resync: z.boolean().optional(),
  })
  .strict();
export const notificationListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      tournamentId: z.string(),
      tournamentName: z.string(),
      kind: notificationKind,
      title: z.string(),
      detail: z.string(),
      createdAt: z.string(),
      readAt: z.string().nullable(),
    }),
  ),
  unread: z.number(),
  nextCursor: z.string().nullable(),
  emailAvailable: z.boolean(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;
export type NotificationPreferences = z.infer<typeof preferenceSchema>;
