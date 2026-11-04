import { organizationEventsAccess } from "../organizations/policy.js";
import { isDeepStrictEqual } from "node:util";
import { engineRulesSchema } from "../../../../../packages/shared/src/engine.js";
import { promoteWaitlist } from "../registrations/waitlist.js";
import type { z } from "zod";
import { tournamentSchema } from "../../../../../packages/shared/src/tournaments.js";
import { db, requireCondition, transaction } from "../../database/client.js";
import { owned } from "./policy.js";
import { audit } from "../administration/audit.js";
import { requireTeamActor } from "../teams/policy.js";
export async function createTournament(actorId: string, input: z.infer<typeof tournamentSchema>) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    if (input.organizationId) await organizationEventsAccess(input.organizationId, actorId, tx);
    const { saveAsDraft, ...data } = input;
    const event = await tx.tournament.create({
      data: { ...data, organizerId: actorId, phase: saveAsDraft ? "DRAFT" : "REGISTRATION" },
    });
    await audit(
      tx,
      actorId,
      saveAsDraft ? "tournament.drafted" : "tournament.published",
      "Tournament",
      event.id,
    );
    return { ...event, shareTokenHash: undefined };
  });
}
export async function editTournament(
  id: string,
  actorId: string,
  input: z.infer<typeof tournamentSchema>,
) {
  return transaction(async (tx) => {
    const event = await owned(tx, id, actorId);
    requireCondition(
      ["DRAFT", "PUBLISHED", "REGISTRATION", "POSTPONED"].includes(event.phase),
      "Only pre-start tournaments can be edited.",
    );
    const entries = await tx.tournamentRegistration.count({ where: { tournamentId: id } });
    if (entries)
      for (const field of [
        "game",
        "teamSize",
        "competitionType",
        "format",
        "engineRules",
        "matchFormat",
        "eligibility",
        "eligibleRegions",
        "visibility",
        "checkInRequired",
      ] as const)
        requireCondition(
          field === "engineRules"
            ? isDeepStrictEqual(
                { noShowGraceMinutes: 15, ...engineRulesSchema.parse(event.engineRules) },
                { noShowGraceMinutes: 15, ...input.engineRules },
              )
            : JSON.stringify(event[field]) === JSON.stringify(input[field]),
          "Competition rules and visibility cannot change after registrations exist.",
        );
    const reserved = await tx.tournamentRegistration.count({
      where: { tournamentId: id, status: { in: ["PENDING", "APPROVED"] } },
    });
    requireCondition(
      input.maxTeams >= reserved,
      "Capacity cannot be smaller than reserved places.",
    );
    requireCondition(
      input.organizationId === undefined || input.organizationId === event.organizationId,
      "Tournament organization cannot be reassigned.",
    );
    const { saveAsDraft: _saveAsDraft, ...data } = input;
    const changed = await tx.tournament.update({ where: { id }, data });
    await audit(tx, actorId, "tournament.edited", "Tournament", id);
    await promoteWaitlist(tx, id, actorId);
    return { ...changed, shareTokenHash: undefined };
  });
}
export async function changeLifecycle(
  id: string,
  actorId: string,
  action: "PUBLISH" | "CHECK_IN" | "CANCEL" | "POSTPONE",
  reason = "",
) {
  return transaction(async (tx) => {
    const event = await owned(tx, id, actorId);
    requireCondition(
      !["CANCELLED", "COMPLETED"].includes(event.phase),
      "This tournament is final.",
    );
    if (action === "PUBLISH") {
      requireCondition(
        ["DRAFT", "POSTPONED"].includes(event.phase),
        "Only drafts or postponed events can be published.",
      );
      tournamentSchema.parse({
        name: event.name,
        game: event.game,
        description: event.description,
        rules: event.rules,
        teamSize: event.teamSize,
        maxTeams: event.maxTeams,
        opensAt: event.opensAt.toISOString(),
        closesAt: event.closesAt.toISOString(),
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt?.toISOString() || null,
        region: event.region,
        locationType: event.locationType,
        location: event.location,
        competitionType: event.competitionType,
        format: event.format,
        engineRules: event.engineRules,
        matchFormat: event.matchFormat,
        eligibility: event.eligibility,
        eligibleRegions: event.eligibleRegions,
        prizeInfo: event.prizeInfo,
        visibility: event.visibility,
        checkInRequired: event.checkInRequired,
        waitlistEnabled: event.waitlistEnabled,
      });
    } else if (action === "CHECK_IN") {
      requireCondition(
        ["REGISTRATION", "PUBLISHED"].includes(event.phase) && event.checkInRequired,
        "This event cannot enter check-in.",
      );
      requireCondition(
        new Date() >= event.closesAt && new Date() < event.startsAt,
        "Check-in opens when registration closes and ends at tournament start.",
      );
    } else {
      requireCondition(
        reason.trim().length >= 10,
        "Give participants a reason (at least 10 characters).",
      );
      if (action === "POSTPONE")
        requireCondition(
          ["DRAFT", "REGISTRATION", "PUBLISHED", "CHECK_IN"].includes(event.phase),
          "Ongoing events cannot be postponed.",
        );
      await tx.tournamentAnnouncement.create({
        data: {
          tournamentId: id,
          title: action === "CANCEL" ? "Tournament cancelled" : "Tournament postponed",
          body: reason,
        },
      });
      await tx.tournamentRegistration.updateMany({
        where: { tournamentId: id },
        data: { checkedInAt: null },
      });
    }
    await tx.tournament.update({
      where: { id },
      data: {
        phase:
          action === "PUBLISH"
            ? "PUBLISHED"
            : action === "CHECK_IN"
              ? "CHECK_IN"
              : action === "CANCEL"
                ? "CANCELLED"
                : "POSTPONED",
        ...(action === "CANCEL" ? { cancellationReason: reason } : {}),
      },
    });
    if (action === "PUBLISH") await promoteWaitlist(tx, id, actorId);
    await audit(tx, actorId, `tournament.${action.toLowerCase()}`, "Tournament", id);
    return { ok: true };
  });
}
export function announce(id: string, actorId: string, data: { title: string; body: string }) {
  return transaction(async (tx) => {
    await owned(tx, id, actorId);
    const message = await tx.tournamentAnnouncement.create({ data: { ...data, tournamentId: id } });
    await audit(tx, actorId, "tournament.announcement", "Tournament", id);
    return message;
  });
}
export async function exportEntries(id: string, actorId: string) {
  await owned(db, id, actorId);
  const rows = await db.tournamentRegistration.findMany({
    where: { tournamentId: id },
    include: { team: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const cell = (value: string) =>
    `"${(/^[\s]*[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  const { rosterOf } = await import("../registrations/domain.js");
  return [
    "Participant,Status,Registered,Checked in,Roster",
    ...rows.map((r) =>
      [
        r.team.name,
        r.status,
        r.createdAt.toISOString(),
        r.checkedInAt?.toISOString() || "",
        rosterOf(r.roster)
          .map((p) => p.username)
          .join("; "),
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\r\n");
}
