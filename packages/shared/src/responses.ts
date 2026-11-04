import {
  organizationResponse,
  workspaceResponse,
  invitationResponse,
  myInvitationResponse,
  analyticsResponse,
  publicOrganizationResponse,
} from "./organizations.js";
import { notificationListSchema, preferenceSchema } from "./notifications.js";
import {
  battleViewSchema,
  engineActivitySchema,
  correctionPreviewSchema,
} from "./engine-responses.js";
import { engineRulesSchema } from "./engine.js";
import { z } from "zod";
import { gameSchema } from "./validation.js";
const user = z.object({
  id: z.string(),
  username: z.string(),
  role: z.enum(["PLAYER", "ORGANIZER"]),
  email: z.string().optional(),
  roles: z.array(z.enum(["PLAYER", "ORGANIZER"])).optional(),
  platformRole: z.enum(["NONE", "MODERATOR", "ADMIN"]).optional(),
  emailVerifiedAt: z.string().nullable().optional(),
  verificationRequired: z.boolean().optional(),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  region: z.string().optional(),
  gamesPlayed: z.array(gameSchema).optional(),
  socialLinks: z.array(z.string()).optional(),
  profilePublic: z.boolean().optional(),
  showHistory: z.boolean().optional(),
  showTeams: z.boolean().optional(),
  avatarId: z.string().nullable().optional(),
});
const teamSummary = z.object({
  id: z.string(),
  name: z.string(),
  game: gameSchema,
  captainId: z.string(),
  region: z.string().optional(),
  archivedAt: z.string().nullable().optional(),
  description: z.string(),
  logoUrl: z.string().nullable().optional(),
});
const team = teamSummary.extend({
  captain: user,
  members: z.array(
    z.object({
      userId: z.string(),
      user,
      manager: z.boolean().optional(),
      substitute: z.boolean().optional(),
    }),
  ),
  locked: z.boolean().optional(),
  transferToId: z.string().nullable().optional(),
  transferExpiresAt: z.string().nullable().optional(),
});
const registration = z.object({
  id: z.string(),
  teamId: z.string(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "WAITLISTED", "WITHDRAWN"]),
});
const match = z.object({
  liveScoreA: z.number().nullable(),
  liveScoreB: z.number().nullable(),
  stageId: z.string().nullable(),
  sourceAId: z.string().nullable(),
  sourceBId: z.string().nullable(),
  sourceAOutcome: z.string().nullable(),
  sourceBOutcome: z.string().nullable(),
  outcome: z.string(),
  version: z.number(),
  matchFormat: z.string().nullable(),
  slotMinutes: z.number(),
  bracket: z.string().default("WINNERS"),
  id: z.string(),
  tournamentId: z.string(),
  round: z.number(),
  position: z.number(),
  teamAId: z.string().nullable(),
  teamBId: z.string().nullable(),
  teamA: teamSummary.nullable(),
  teamB: teamSummary.nullable(),
  winner: teamSummary.nullable(),
  winnerId: z.string().nullable(),
  scoreA: z.number().nullable(),
  scoreB: z.number().nullable(),
  status: z.enum(["PENDING", "SCHEDULED", "COMPLETED"]),
  isBye: z.boolean(),
  scheduledAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  venue: z.string(),
  tournament: z.object({ id: z.string(), name: z.string() }).optional(),
});
const event = z.object({
  engineRules: engineRulesSchema.default({}),
  region: z.string().default(""),
  locationType: z.string().default("ONLINE"),
  location: z.string().default(""),
  competitionType: z.string().default("TEAM"),
  visibility: z.string().default("PUBLIC"),
  eligibility: z.string().default(""),
  eligibleRegions: z.array(z.string()).default([]),
  prizeInfo: z.string().default(""),
  matchFormat: z.string().default("SCORE"),
  endsAt: z.string().nullable().optional(),
  coverId: z.string().nullable().optional(),
  checkInRequired: z.boolean().default(false),
  waitlistEnabled: z.boolean().default(false),
  cancellationReason: z.string().default(""),
  id: z.string(),
  name: z.string(),
  game: gameSchema,
  organizerId: z.string(),
  organizer: user,
  organization: z
    .object({ id: z.string(), name: z.string(), publicProfile: z.boolean() })
    .nullable()
    .optional(),
  teamSize: z.number(),
  maxTeams: z.number(),
  opensAt: z.string(),
  closesAt: z.string(),
  startsAt: z.string(),
  phase: z.string(),
  status: z.string(),
  format: z.string(),
  description: z.string(),
  rules: z.string(),
  registeredCount: z.number(),
  champion: teamSummary.nullable(),
});
const fullRegistration = registration.extend({
  checkedInAt: z.string().nullable().optional(),
  waitlistReason: z.string().default(""),
  team,
  roster: z.array(z.object({ id: z.string(), username: z.string() })),
  createdAt: z.string(),
  canManageRoster: z.boolean().optional(),
  proposedRoster: z
    .array(z.object({ id: z.string(), username: z.string() }))
    .nullable()
    .optional(),
});
const detail = event.extend({
  stages: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        kind: z.string(),
        groupNumber: z.number().nullable(),
        completed: z.boolean(),
      }),
    )
    .default([]),
  announcements: z
    .array(z.object({ id: z.string(), title: z.string(), body: z.string(), createdAt: z.string() }))
    .default([]),
  standings: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        wins: z.number(),
        losses: z.number(),
        draws: z.number().default(0),
        points: z.number().optional(),
        stageName: z.string().optional(),
        byes: z.number(),
        buchholz: z.number(),
        difference: z.number(),
        kda: z.number(),
        averageWinSeconds: z.number(),
      }),
    )
    .default([]),
  canManage: z.boolean().optional(),
  registrations: z.array(fullRegistration),
  matches: z.array(match),
});
const dashboard = z.object({
  teams: z.array(team),
  tournaments: z.array(event.extend({ registrations: z.array(registration) })),
  totalRegistrations: z.number(),
  upcomingMatches: z.array(match),
  recentResults: z.array(match),
});
const invitation = z.object({
  id: z.string(),
  teamId: z.string(),
  userId: z.string(),
  status: z.enum(["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"]),
  expiresAt: z.string(),
  user: z.object({ id: z.string(), username: z.string() }),
  team: z.object({ id: z.string(), name: z.string(), game: gameSchema }),
});
const competitionHistory = z.object({
  statistics: z.object({
    tournaments: z.number(),
    wins: z.number(),
    losses: z.number(),
    draws: z.number().default(0),
    championships: z.number(),
    winRate: z.number().nullable(),
  }),
  history: z.array(
    z.object({
      tournament: z.object({
        id: z.string(),
        name: z.string(),
        game: gameSchema,
        phase: z.string(),
        startsAt: z.string(),
        championId: z.string().nullable(),
      }),
      team: z.object({ id: z.string(), name: z.string() }),
      wins: z.number(),
      losses: z.number(),
      draws: z.number().default(0),
      battleRounds: z
        .array(
          z.object({
            number: z.number(),
            placement: z.number().nullable(),
            eliminations: z.number(),
            noShow: z.boolean(),
            points: z.number(),
          }),
        )
        .default([]),
      champion: z.boolean(),
      matches: z.array(
        z.object({
          id: z.string(),
          teamA: z.object({ name: z.string() }).nullable(),
          teamB: z.object({ name: z.string() }).nullable(),
          outcome: z.string().default("PLAYED"),
          scoreA: z.number().nullable(),
          scoreB: z.number().nullable(),
        }),
      ),
    }),
  ),
});
export type TeamInvitation = z.infer<typeof invitation>;
export type CompetitionHistory = z.infer<typeof competitionHistory>;
const playerProfile = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  bio: z.string(),
  region: z.string(),
  gamesPlayed: z.array(gameSchema),
  socialLinks: z.array(z.string()),
  avatarId: z.string().nullable(),
  profilePublic: z.boolean(),
  showHistory: z.boolean(),
  showTeams: z.boolean(),
  self: z.boolean(),
  teams: z
    .array(
      z.object({
        manager: z.boolean(),
        substitute: z.boolean(),
        team: z.object({
          id: z.string(),
          name: z.string(),
          game: gameSchema,
          captainId: z.string(),
          archivedAt: z.string().nullable(),
        }),
      }),
    )
    .nullable(),
  record: competitionHistory.nullable(),
});
export type PlayerProfile = z.infer<typeof playerProfile>;
export function validateResponse(path: string, method: string, data: unknown): unknown {
  const pathname = path.split("?")[0];
  if (["/auth/me", "/auth/login", "/auth/register"].includes(pathname))
    return z.object({ user: user.nullable() }).parse(data);
  if (pathname === "/account")
    return z.object({ user, googleLinked: z.boolean().optional() }).parse(data);
  if (pathname === "/auth/options")
    return z.object({ email: z.boolean(), google: z.boolean() }).parse(data);
  if (pathname === "/account/sessions" && method === "GET")
    return z
      .array(
        z.object({
          id: z.string(),
          createdAt: z.string(),
          expiresAt: z.string(),
          current: z.boolean(),
        }),
      )
      .parse(data);
  if (method !== "GET")
    return z.record(z.string(), z.unknown()).or(z.array(z.unknown())).parse(data);
  if (pathname === "/organizations") return z.array(organizationResponse).parse(data);
  if (/^\/organizations\/[^/]+\/members$/.test(pathname))
    return z
      .array(
        z.object({
          userId: z.string(),
          role: z.enum(["OWNER", "ADMIN", "MANAGER", "MEMBER"]),
          user: z.object({ id: z.string(), username: z.string() }),
        }),
      )
      .parse(data);
  if (pathname === "/organization-invitations") return z.array(myInvitationResponse).parse(data);
  if (/^\/organizations\/[^/]+\/public$/.test(pathname))
    return publicOrganizationResponse.parse(data);
  if (/^\/organizations\/[^/]+\/invitations$/.test(pathname))
    return z.array(invitationResponse).parse(data);
  if (/^\/organizations\/[^/]+\/analytics$/.test(pathname)) return analyticsResponse.parse(data);
  if (/^\/organizations\/[^/]+$/.test(pathname)) return workspaceResponse.parse(data);
  if (pathname === "/admin/security-events")
    return z
      .array(
        z.object({
          id: z.string(),
          action: z.string(),
          actorId: z.string().nullable(),
          resourceType: z.string(),
          resourceId: z.string(),
          createdAt: z.string(),
        }),
      )
      .parse(data);
  if (pathname === "/notifications") return notificationListSchema.parse(data);
  if (pathname === "/notifications/preferences") return preferenceSchema.parse(data);
  if (pathname === "/dashboard") return dashboard.parse(data);
  if (/^\/organizers\/[^/]+$/.test(pathname))
    return z
      .object({
        username: z.string(),
        displayName: z.string(),
        bio: z.string(),
        avatarId: z.string().nullable(),
        tournaments: z.array(event),
      })
      .parse(data);
  if (/^\/tournaments\/[^/]+\/battle$/.test(pathname)) return battleViewSchema.parse(data);
  if (/^\/tournaments\/[^/]+\/(engine-history|my-reports)$/.test(pathname))
    return engineActivitySchema.parse(data);
  if (/^\/tournaments\/[^/]+\/disputes\/[^/]+\/preview$/.test(pathname))
    return correctionPreviewSchema.parse(data);
  if (pathname === "/tournaments") return z.array(event).parse(data);
  if (/^\/tournaments\/[^/]+$/.test(pathname)) return detail.parse(data);
  if (pathname === "/team-invitations" || /^\/teams\/[^/]+\/invitations$/.test(pathname))
    return z.array(invitation).parse(data);
  if (/^\/teams\/[^/]+\/history$/.test(pathname)) return competitionHistory.parse(data);
  if (/^\/players\/[^/]+$/.test(pathname)) return playerProfile.parse(data);
  if (pathname === "/teams") return z.array(team).parse(data);
  if (/^\/teams\/[^/]+$/.test(pathname)) return team.parse(data);
  if (pathname === "/users") return z.array(user).parse(data);
  return data;
}

export type User = z.infer<typeof user>;
export type Team = z.infer<typeof team>;
export type TeamSummary = z.infer<typeof teamSummary>;
export type Registration = z.infer<typeof fullRegistration>;
export type Match = z.infer<typeof match>;
export type EventSummary = z.infer<typeof event>;
export type Event = z.infer<typeof detail>;
export type Dashboard = z.infer<typeof dashboard>;
