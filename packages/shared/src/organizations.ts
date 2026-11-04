import { z } from "zod";
export const organizationProfileSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().max(3000).default(""),
    region: z.string().trim().max(80).default(""),
    website: z
      .union([
        z.literal(""),
        z
          .string()
          .url()
          .max(500)
          .refine((v) => new URL(v).protocol === "https:", "Use an HTTPS website."),
      ])
      .default(""),
    publicProfile: z.boolean().default(false),
  })
  .strict();
export const analyticsQuerySchema = z
  .object({
    days: z.coerce.number().int().min(7).max(366).default(90),
  })
  .strict();
export const staffRoleSchema = z.enum(["ADMIN", "MANAGER", "MEMBER"]);
export const organizationInviteSchema = z
  .object({
    recipient: z.string().trim().min(2).max(254),
    role: staffRoleSchema,
  })
  .strict();
const eventSummary = z.object({
  id: z.string(),
  name: z.string(),
  game: z.string(),
  phase: z.string(),
  startsAt: z.string(),
  permissions: z.array(z.object({ userId: z.string(), canManage: z.boolean() })).optional(),
});
export const organizationResponse = organizationProfileSchema.extend({
  id: z.string(),
  logoId: z.string().nullable(),
  version: z.number(),
  ownerId: z.string(),
  access: z.enum(["OWNER", "ADMIN", "MANAGER", "MEMBER"]),
});
export const workspaceResponse = organizationResponse.extend({
  tournaments: z.array(eventSummary),
  emailAvailable: z.boolean(),
});
export type Workspace = z.infer<typeof workspaceResponse>;
export const invitationResponse = z.object({
  id: z.string(),
  label: z.string(),
  role: staffRoleSchema,
  status: z.string(),
  expiresAt: z.string(),
  emailState: z.string(),
});
export const myInvitationResponse = z.object({
  id: z.string(),
  role: staffRoleSchema,
  expiresAt: z.string(),
  organization: z.object({ id: z.string(), name: z.string() }),
});
export const analyticsResponse = z.object({
  days: z.number(),
  since: z.string(),
  generatedAt: z.string(),
  totals: z.object({
    tournaments: z.number(),
    active: z.number(),
    completed: z.number(),
    registrations: z.number(),
    pendingApprovals: z.number(),
    participatingTeams: z.number(),
  }),
  conversion: z.object({
    submitted: z.number(),
    approved: z.number(),
    rate: z.number().nullable(),
  }),
  attendance: z.object({
    eligible: z.number(),
    checkedIn: z.number(),
    rate: z.number().nullable(),
  }),
  daily: z.array(z.object({ day: z.string(), registrations: z.number() })),
  games: z.array(
    z.object({ game: z.string(), tournaments: z.number(), registrations: z.number() }),
  ),
  teamTrends: z.array(
    z.object({ id: z.string(), name: z.string(), entries: z.number(), previous: z.number() }),
  ),
  upcoming: z.array(
    z.object({
      id: z.string(),
      tournamentId: z.string(),
      scheduledAt: z.string().nullable(),
      label: z.string().optional(),
      tournament: z.object({ name: z.string() }),
      teamA: z.object({ name: z.string() }).nullable(),
      teamB: z.object({ name: z.string() }).nullable(),
    }),
  ),
  activity: z.array(
    z.object({ id: z.string(), action: z.string(), createdAt: z.string(), resourceId: z.string() }),
  ),
  tournaments: z.array(
    eventSummary.extend({
      registrations: z.number(),
      scheduled: z.number(),
      completed: z.number(),
    }),
  ),
});
export type OrganizationAnalytics = z.infer<typeof analyticsResponse>;
export const publicOrganizationResponse = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  region: z.string(),
  website: z.string(),
  logoId: z.string().nullable(),
  tournaments: z.array(eventSummary),
});
