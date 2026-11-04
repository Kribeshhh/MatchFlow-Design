import { Prisma } from "@prisma/client";
import { rosterOf } from "./domain.js";
import { requireCondition, transaction, type Tx } from "../../database/client.js";
import { audit } from "../administration/audit.js";
import { owned, viewable } from "../tournaments/policy.js";
import { beforePlay } from "../tournaments/domain.js";
import { requireTeamActor } from "../teams/policy.js";
import { eligible } from "./policy.js";
import { promoteWaitlist } from "./waitlist.js";
import * as repository from "./repository.js";
async function submit(
  tx: Tx,
  tournamentId: string,
  teamId: string,
  accountId: string,
  manual = false,
) {
  await promoteWaitlist(tx, tournamentId, accountId);
  const existing = await repository.findTeamEntry(tx, tournamentId, teamId);
  requireCondition(
    !existing || existing.status === "WITHDRAWN",
    "This team already has a registration. Contact the organizer about rejected entries.",
  );
  const { t, starters, reserved } = await eligible(tx, tournamentId, teamId, existing?.id, true);
  const allEntries = await tx.tournamentRegistration.findMany({
    where: {
      tournamentId,
      status: { in: ["PENDING", "APPROVED", "WAITLISTED"] },
      ...(existing ? { id: { not: existing.id } } : {}),
    },
    select: { roster: true },
  });
  requireCondition(
    !allEntries.some((r) =>
      rosterOf(r.roster).some((p) => starters.some((m) => m.userId === p.id)),
    ),
    "A player already has an active or waitlisted entry in this tournament.",
  );
  requireCondition(
    reserved < t.maxTeams || t.waitlistEnabled,
    "This tournament is full. Pending registrations reserve a place.",
  );
  const status = reserved >= t.maxTeams ? "WAITLISTED" : manual ? "APPROVED" : "PENDING";
  const roster = starters.map((m) => ({ id: m.userId, username: m.user.username }));
  await audit(
    tx,
    accountId,
    status === "WAITLISTED"
      ? "registration.waitlisted"
      : manual
        ? "registration.manual"
        : "registration.submitted",
    "Tournament",
    tournamentId,
  );
  if (existing)
    return tx.tournamentRegistration.update({
      where: { id: existing.id },
      data: {
        status,
        roster,
        createdAt: new Date(),
        waitlistReason: "",
        checkedInAt: null,
        proposedRoster: (await import("@prisma/client")).Prisma.DbNull,
        rosterProposedBy: null,
      },
    });
  return repository.insertEntry(tx, tournamentId, teamId, status, roster);
}
export function registerTeam(
  tournamentId: string,
  teamId: string,
  accountId: string,
  manual = false,
  sharedIds: string[] = [],
) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, accountId);
    const t = await viewable(tx, tournamentId, accountId, sharedIds);
    requireCondition(t.competitionType === "TEAM", "Use individual registration for this event.");
    if (manual) await owned(tx, tournamentId, accountId);
    else {
      const team = await tx.team.findUnique({ where: { id: teamId }, include: { members: true } });
      requireCondition(
        team &&
          (team.captainId === accountId ||
            team.members.some((m) => m.userId === accountId && m.manager)),
        "Only the captain or a team manager can register this team.",
        403,
      );
    }
    return submit(tx, tournamentId, teamId, accountId, manual);
  });
}
export function registerIndividual(
  tournamentId: string,
  actorId: string,
  sharedIds: string[] = [],
) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const event = await viewable(tx, tournamentId, actorId, sharedIds);
    requireCondition(
      event.competitionType === "INDIVIDUAL" && event.teamSize === 1,
      "This is not an individual event.",
    );
    const user = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
    const entrant = await tx.team.upsert({
      where: { individualUserId_game: { individualUserId: actorId, game: event.game } },
      create: {
        name: user.displayName || user.username,
        game: event.game,
        competitionType: "INDIVIDUAL",
        individualUserId: actorId,
        captainId: actorId,
        region: user.region,
        members: { create: { userId: actorId, acceptedAt: new Date() } },
      },
      update: { region: user.region },
      select: { id: true },
    });
    return submit(tx, tournamentId, entrant.id, actorId);
  });
}
export function reviewRegistration(
  tournamentId: string,
  registrationId: string,
  owner: string,
  action: "APPROVED" | "REJECTED" | "REMOVE",
) {
  return transaction(async (tx) => {
    const t = await owned(tx, tournamentId, owner);
    requireCondition(
      beforePlay(t.phase),
      "Registrations cannot be changed in this lifecycle state.",
    );
    const r = await repository.findRegistration(tx, registrationId);
    requireCondition(r?.tournamentId === tournamentId, "Registration not found.", 404);
    requireCondition(
      !["WAITLISTED", "WITHDRAWN"].includes(r.status) || action !== "APPROVED",
      "Only entries with a reserved place can be approved. Waitlists promote automatically.",
    );
    requireCondition(
      r.status !== "REJECTED" || action !== "APPROVED",
      "Remove the rejected entry and register again to re-check eligibility.",
    );
    await audit(
      tx,
      owner,
      `registration.${action.toLowerCase()}`,
      "TournamentRegistration",
      registrationId,
    );
    if (action === "REMOVE") {
      await repository.deleteEntry(tx, registrationId);
      await promoteWaitlist(tx, tournamentId, owner);
      return { removed: true };
    }
    if (action === "APPROVED") {
      const players = rosterOf(r.roster);
      const active = await tx.user.count({
        where: { id: { in: players.map((p) => p.id) }, status: "ACTIVE", roles: { has: "PLAYER" } },
      });
      requireCondition(
        players.length === t.teamSize && active === players.length,
        "The saved roster must contain the required active players.",
      );
    }
    if (action === "REJECTED")
      await tx.tournamentRegistration.update({
        where: { id: registrationId },
        data: { checkedInAt: null, proposedRoster: Prisma.DbNull, rosterProposedBy: null },
      });
    const result = await repository.setStatus(tx, registrationId, action);
    if (action === "REJECTED") await promoteWaitlist(tx, tournamentId, owner);
    return result;
  });
}
async function participantAuthority(
  tx: Tx,
  tournamentId: string,
  registrationId: string,
  actorId: string,
) {
  const entry = await tx.tournamentRegistration.findUnique({
    where: { id: registrationId },
    include: { team: { include: { members: true } } },
  });
  requireCondition(entry?.tournamentId === tournamentId, "Registration not found.", 404);
  requireCondition(
    entry.team.captainId === actorId ||
      (entry.team.competitionType === "TEAM" &&
        entry.team.members.some((m) => m.userId === actorId && m.manager)),
    "Only the entrant, captain or authorized manager may perform this action.",
    403,
  );
  return entry;
}
export function withdraw(
  tournamentId: string,
  registrationId: string,
  actorId: string,
  sharedIds: string[] = [],
) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const event = await viewable(tx, tournamentId, actorId, sharedIds);
    requireCondition(
      ["REGISTRATION", "PUBLISHED"].includes(event.phase) && new Date() < event.closesAt,
      "Withdrawal closes with registration.",
    );
    const entry = await participantAuthority(tx, tournamentId, registrationId, actorId);
    requireCondition(
      ["PENDING", "APPROVED", "WAITLISTED"].includes(entry.status),
      "This entry cannot be withdrawn.",
    );
    await tx.tournamentRegistration.update({
      where: { id: entry.id },
      data: {
        status: "WITHDRAWN",
        checkedInAt: null,
        proposedRoster: (await import("@prisma/client")).Prisma.DbNull,
        rosterProposedBy: null,
      },
    });
    await promoteWaitlist(tx, tournamentId, actorId);
    await audit(tx, actorId, "registration.withdrawn", "TournamentRegistration", entry.id);
    return { ok: true };
  });
}
export function checkIn(
  tournamentId: string,
  registrationId: string,
  actorId: string,
  sharedIds: string[] = [],
) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, actorId);
    const event = await viewable(tx, tournamentId, actorId, sharedIds);
    requireCondition(
      event.phase === "CHECK_IN" && new Date() >= event.closesAt && new Date() < event.startsAt,
      "Check-in is not open.",
    );
    const entry = await participantAuthority(tx, tournamentId, registrationId, actorId);
    requireCondition(entry.status === "APPROVED", "Only approved participants can check in.");
    await tx.tournamentRegistration.update({
      where: { id: entry.id },
      data: { checkedInAt: entry.checkedInAt || new Date() },
    });
    await audit(tx, actorId, "registration.checked-in", "TournamentRegistration", entry.id);
    return { ok: true };
  });
}
