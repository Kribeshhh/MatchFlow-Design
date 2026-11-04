import { engineRulesSchema } from "./engine.js";
import { z } from "zod";
import { gameSchema, text } from "./common.js";
export const formatSchema = z.enum([
  "SINGLE_ELIMINATION",
  "DOUBLE_ELIMINATION",
  "ROUND_ROBIN",
  "SWISS",
  "GROUPS",
  "LEAGUE",
  "BATTLE_ROYALE",
]);
export const tournamentFields = z
  .object({
    organizationId: z.string().cuid().nullable().optional(),
    name: text(3, 100),
    game: gameSchema,
    description: text(10, 5000),
    rules: text(10, 5000),
    teamSize: z.number().int().min(1).max(10),
    maxTeams: z.number().int().min(2).max(64),
    opensAt: z.string().datetime(),
    closesAt: z.string().datetime(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().nullable().optional(),
    region: text(0, 80).default(""),
    locationType: z.enum(["ONLINE", "OFFLINE"]).default("ONLINE"),
    location: text(0, 300).default(""),
    competitionType: z.enum(["TEAM", "INDIVIDUAL"]).default("TEAM"),
    engineRules: engineRulesSchema.default({}),
    format: formatSchema.default("SINGLE_ELIMINATION"),
    matchFormat: z.enum(["SCORE", "BO1", "BO3", "BO5"]).default("SCORE"),
    eligibility: text(0, 3000).default(""),
    eligibleRegions: z.array(text(1, 80)).max(20).default([]),
    prizeInfo: text(0, 2000).default(""),
    entryCategory: z.literal("FREE").default("FREE"),
    visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
    checkInRequired: z.boolean().default(false),
    waitlistEnabled: z.boolean().default(false),
    saveAsDraft: z.boolean().default(false),
  })
  .strict();
export const tournamentSchema = tournamentFields.superRefine((v, ctx) => {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });
  if (!(
    Date.parse(v.opensAt) < Date.parse(v.closesAt) &&
    Date.parse(v.closesAt) <= Date.parse(v.startsAt)
  ))
    issue("closesAt", "Registration must open before closing, and close by the tournament start.");
  if (Date.parse(v.startsAt) <= Date.now())
    issue("startsAt", "Tournament start must be in the future.");
  if (v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt))
    issue("endsAt", "End must be after start.");
  if (v.locationType === "OFFLINE" && !v.location.trim())
    issue("location", "Offline events need a location.");
  if (v.competitionType === "INDIVIDUAL" && v.teamSize !== 1)
    issue("teamSize", "Individual events require one player per entry.");
  if (v.checkInRequired && Date.parse(v.closesAt) >= Date.parse(v.startsAt))
    issue("startsAt", "Allow time between registration close and tournament start for check-in.");
  if (["pubg", "ff"].includes(v.game) && v.matchFormat !== "SCORE")
    issue("matchFormat", "Use score-based matches or battle-royale points for this game.");
  if (["ROUND_ROBIN", "SWISS", "LEAGUE"].includes(v.format) && v.maxTeams > 16)
    issue("maxTeams", "Round robin, Swiss and leagues support at most 16 participants.");
  const rules = v.engineRules;
  if (v.format === "GROUPS") {
    if (!rules.groups) issue("engineRules", "Configure group count and qualifiers.");
    else if (
      Math.floor(v.maxTeams / rules.groups.count) <= rules.groups.advance ||
      Math.ceil(v.maxTeams / rules.groups.count) > 16
    )
      issue(
        "maxTeams",
        "Each group needs more participants than qualifiers and at most 16 participants.",
      );
  }
  if (v.format === "LEAGUE") {
    if (!rules.league) issue("engineRules", "Configure league cycles and points.");
    if (rules.league?.allowDraws && v.matchFormat !== "SCORE")
      issue("matchFormat", "Leagues with draws require score-based matches.");
  }
  if (v.format === "BATTLE_ROYALE") {
    if (!rules.battle)
      issue(
        "engineRules",
        "Configure placement points, elimination points, rounds and ordered tie-breakers.",
      );
    if (v.matchFormat !== "SCORE")
      issue("matchFormat", "Battle royale uses lobby points, not best-of series.");
  }
  if (
    (rules.groups && v.format !== "GROUPS") ||
    (rules.league && v.format !== "LEAGUE") ||
    (rules.battle && v.format !== "BATTLE_ROYALE")
  )
    issue("engineRules", "Only configure rules for the selected format.");
});
export const discoverySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    game: gameSchema.optional(),
    region: text(0, 80).optional(),
    locationType: z.enum(["ONLINE", "OFFLINE"]).optional(),
    format: formatSchema.optional(),
    teamSize: z.coerce.number().int().min(1).max(10).optional(),
    competitionType: z.enum(["TEAM", "INDIVIDUAL"]).optional(),
    category: z.enum(["FREE", "PAID"]).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    status: z
      .enum([
        "UPCOMING",
        "REGISTRATION_OPEN",
        "REGISTRATION_CLOSED",
        "CHECK_IN",
        "ONGOING",
        "COMPLETED",
        "CANCELLED",
        "POSTPONED",
      ])
      .optional(),
    sort: z.enum(["UPCOMING", "NEWEST", "POPULARITY", "DEADLINE"]).default("NEWEST"),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .refine(
    (v) => !v.dateFrom || !v.dateTo || Date.parse(v.dateFrom) <= Date.parse(v.dateTo),
    "Date range is reversed.",
  );
export const announcementSchema = z.object({ title: text(3, 120), body: text(1, 5000) }).strict();
