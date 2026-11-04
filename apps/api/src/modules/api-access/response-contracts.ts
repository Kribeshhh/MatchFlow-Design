import { z } from "zod";
const text = z.string(),
  nullable = text.nullable(),
  date = z.string().datetime(),
  maybeDate = date.nullable(),
  count = z.number().int();
export const tournamentDto = z.object({
  id: text,
  name: text,
  game: text,
  description: text,
  rules: text,
  eligibility: text,
  region: text,
  locationType: text,
  location: text,
  teamSize: count,
  maxTeams: count,
  opensAt: date,
  closesAt: date,
  startsAt: date,
  endsAt: maybeDate,
  format: text,
  matchFormat: text,
  phase: text,
  visibility: text,
  organizationId: nullable,
  championId: nullable,
  engineVersion: count,
  createdAt: date,
});
export const matchDto = z.object({
  id: text,
  tournamentId: text,
  stageId: nullable,
  round: count,
  position: count,
  bracket: text,
  sourceAId: nullable,
  sourceBId: nullable,
  sourceAOutcome: text,
  sourceBOutcome: text,
  teamAId: nullable,
  teamBId: nullable,
  scoreA: count.nullable(),
  scoreB: count.nullable(),
  liveScoreA: count.nullable(),
  liveScoreB: count.nullable(),
  winnerId: nullable,
  isBye: z.boolean(),
  status: text,
  scheduledAt: maybeDate,
  completedAt: maybeDate,
  venue: text,
  slotMinutes: count,
  version: count,
  outcome: text,
  matchFormat: nullable,
});
export const organizationDto = z.object({
  id: text,
  name: text,
  description: text,
  region: text,
  website: text,
});
export const announcementDto = z.object({ id: text, title: text, body: text, createdAt: date });
export const scheduleDto = z.object({
  id: text,
  scheduledAt: maybeDate,
  venue: text,
  slotMinutes: count,
  version: count,
});
export const registrationDto = z.object({
  id: text,
  teamId: text,
  status: text,
  checkedInAt: maybeDate,
  createdAt: date,
});
export const teamDto = z.object({ id: text, name: text, game: text, region: text });
export const roundDto = z.object({
  id: text,
  number: count,
  status: text,
  scheduledAt: maybeDate,
  venue: text,
  version: count,
  results: z.array(
    z.object({
      teamId: text,
      placement: count.nullable(),
      eliminations: count,
      noShow: z.boolean(),
    }),
  ),
});
const standingDto = z
  .object({ id: text })
  .catchall(z.union([text, z.number(), z.boolean(), z.null()]));
export const pageDto = (schema: z.ZodType) =>
  z.object({ data: z.array(schema), nextCursor: nullable });
export function responseContract(path: string) {
  if (path.endsWith("/organization")) return organizationDto;
  if (path.endsWith("/organizations")) return pageDto(organizationDto);
  if (path.endsWith("/{id}")) return tournamentDto;
  if (path.endsWith("/tournaments")) return pageDto(tournamentDto);
  if (path.endsWith("/teams")) return pageDto(teamDto);
  if (path.endsWith("/announcements")) return pageDto(announcementDto);
  if (path.endsWith("/registrations")) return pageDto(registrationDto);
  if (path.endsWith("/rounds")) return pageDto(roundDto);
  if (path.endsWith("/standings"))
    return pageDto(standingDto).extend({ championId: nullable.optional() });
  return pageDto(matchDto);
}
export const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema);
