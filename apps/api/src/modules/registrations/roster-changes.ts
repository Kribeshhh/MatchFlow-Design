import { requireCondition, transaction } from "../../database/client.js";
import { editableTeam } from "../teams/policy.js";
import { owned, viewable } from "../tournaments/policy.js";
import { audit } from "../administration/audit.js";
import { eligible } from "./policy.js";
import { rosterOf } from "./domain.js";
export function proposeRoster(
  tournamentId: string,
  registrationId: string,
  actorId: string,
  sharedIds: string[] = [],
) {
  return transaction(async (tx) => {
    await viewable(tx, tournamentId, actorId, sharedIds);
    const entry = await tx.tournamentRegistration.findUnique({ where: { id: registrationId } });
    requireCondition(entry?.tournamentId === tournamentId, "Registration not found.", 404);
    await editableTeam(tx, entry.teamId, actorId);
    requireCondition(
      ["PENDING", "APPROVED"].includes(entry.status),
      "Rejected entries must be resubmitted.",
    );
    const { starters } = await eligible(tx, tournamentId, entry.teamId, entry.id);
    await tx.tournamentRegistration.update({
      where: { id: entry.id },
      data: {
        proposedRoster: starters.map((m) => ({ id: m.userId, username: m.user.username })),
        rosterProposedBy: actorId,
      },
    });
    await audit(tx, actorId, "registration.roster.proposed", "TournamentRegistration", entry.id);
    return { ok: true };
  });
}
export function reviewRoster(
  tournamentId: string,
  registrationId: string,
  actorId: string,
  approve: boolean,
) {
  return transaction(async (tx) => {
    const t = await owned(tx, tournamentId, actorId);
    const entry = await tx.tournamentRegistration.findUnique({ where: { id: registrationId } });
    requireCondition(entry?.tournamentId === tournamentId, "Registration not found.", 404);
    requireCondition(
      entry.proposedRoster && ["PENDING", "APPROVED"].includes(entry.status),
      "No pending roster request.",
      409,
    );
    requireCondition(
      ["REGISTRATION", "PUBLISHED"].includes(t.phase) && t.closesAt > new Date(),
      "Tournament rosters are locked after registration closes.",
    );
    if (approve) {
      const { starters } = await eligible(tx, tournamentId, entry.teamId, entry.id);
      const proposal = rosterOf(entry.proposedRoster);
      requireCondition(
        proposal.length === starters.length &&
          starters.every((m) => proposal.some((p) => p.id === m.userId)),
        "The proposed players no longer match the current starting team. Request a new roster change.",
        409,
      );
      await tx.tournamentRegistration.update({
        where: { id: entry.id },
        data: { roster: proposal },
      });
    }
    const { Prisma } = await import("@prisma/client");
    await tx.tournamentRegistration.update({
      where: { id: entry.id },
      data: { proposedRoster: Prisma.DbNull, rosterProposedBy: null },
    });
    await audit(
      tx,
      actorId,
      approve ? "registration.roster.approved" : "registration.roster.rejected",
      "TournamentRegistration",
      entry.id,
    );
    return { ok: true };
  });
}
