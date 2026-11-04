import { scheduleBattleAuthorized } from "../brackets/battle.js";
import { transaction, requireCondition } from "../../database/client.js";
import { eventAccess } from "./policy.js";
import { fingerprint, json } from "../brackets/commands.js";
import { scheduleAuthorized } from "../matches/service.js";
import {
  apiAnnouncementSchema,
  apiScheduleSchema,
} from "../../../../../packages/shared/src/developer.js";
export function executeCommand(
  token: string,
  tournamentId: string,
  key: string,
  operation: "announcement" | "schedule" | "round-schedule",
  body: unknown,
  matchId?: string,
) {
  const input =
    operation === "announcement"
      ? apiAnnouncementSchema.parse(body)
      : apiScheduleSchema.parse(body);
  return transaction(async (tx) => {
    const { app, tournament } = await eventAccess(
      tx,
      token,
      tournamentId,
      operation === "announcement" ? "announcements:write" : "schedules:write",
    );
    const hash = fingerprint({ tournamentId, operation, matchId, input });
    const old = await tx.apiCommand.findUnique({
      where: { integrationId_key: { integrationId: app.id, key } },
    });
    if (old) {
      requireCondition(
        old.requestHash === hash,
        "Idempotency key already used for another request.",
        409,
      );
      return old.response;
    }
    let response;
    if (operation === "announcement") {
      const data = apiAnnouncementSchema.parse(input);
      response = await tx.tournamentAnnouncement.create({
        data: { ...data, tournamentId },
        select: { id: true, title: true, body: true, createdAt: true },
      });
    } else {
      const data = apiScheduleSchema.parse(input);
      const match =
        operation === "round-schedule"
          ? await tx.battleRound.findFirst({ where: { id: matchId!, tournamentId } })
          : await tx.match.findFirst({ where: { id: matchId!, tournamentId } });
      requireCondition(match, "Match not found.", 404);
      requireCondition(
        match.version === data.expectedVersion,
        "Match changed. Reload before scheduling.",
        409,
      );
      const m = await (
        operation === "round-schedule" ? scheduleBattleAuthorized : scheduleAuthorized
      )(tx, tournament, match.id, null, data.scheduledAt, data.venue, data.slotMinutes);
      response = {
        id: m.id,
        scheduledAt: m.scheduledAt,
        venue: m.venue,
        slotMinutes: m.slotMinutes,
        version: m.version,
      };
    }
    await tx.auditEvent.create({
      data: { action: `integration.${operation}`, resourceType: "Integration", resourceId: app.id },
    });
    await tx.apiCommand.create({
      data: { integrationId: app.id, key, requestHash: hash, response: json(response) },
    });
    return response;
  });
}
