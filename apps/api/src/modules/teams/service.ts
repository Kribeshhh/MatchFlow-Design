import type { z } from "zod";
import { teamSchema } from "../../../../../packages/shared/src/validation.js";
import { db, requireCondition, transaction, teamInclude } from "../../database/client.js";
import { owned } from "../tournaments/policy.js";
import { invite } from "./invitations.js";
import { audit } from "../administration/audit.js";
import { editableTeam, requireTeamActor } from "./policy.js";
import * as repo from "./repository.js";
export async function listTeams(userId: string, eligibleFor?: string, q = "") {
  if (!eligibleFor) return repo.memberTeams(userId);
  const t = await owned(db, eligibleFor, userId);
  return (await repo.candidates(t.id, t.game, q)).filter(
    (team) => team.members.filter((m) => !m.substitute).length === t.teamSize,
  );
}
export function createTeam(userId: string, input: z.infer<typeof teamSchema>) {
  return transaction(async (tx) => {
    await requireTeamActor(tx, userId);
    const team = await repo.insertTeam(userId, input, tx);
    await audit(tx, userId, "team.created", "Team", team.id);
    return team;
  });
}
export async function getTeam(id: string, userId: string) {
  const team = await repo.findTeam(id);
  requireCondition(team?.competitionType === "TEAM", "Team not found.", 404);
  requireCondition(
    team.members.some((m) => m.userId === userId),
    "Only team members can view this team page.",
    403,
  );
  return { ...team, locked: false };
}
export const addMember = invite;
export async function removeMember(teamId: string, actorId: string, userId: string) {
  await transaction(async (tx) => {
    const team = await editableTeam(tx, teamId, actorId);
    requireCondition(userId !== team.captainId, "The captain cannot be removed.");
    const target = team.members.find((m) => m.userId === userId);
    requireCondition(target, "Member not found.", 404);
    requireCondition(
      team.captainId === actorId || !target.manager,
      "Only the captain can remove a manager.",
      403,
    );
    await repo.deleteMember(tx, teamId, userId);
    if (team.transferToId === userId)
      await tx.team.update({
        where: { id: teamId },
        data: { transferToId: null, transferExpiresAt: null },
      });
    await audit(tx, actorId, "team.member.removed", "Team", teamId);
  });
  return { ok: true };
}

export function updateTeam(teamId: string, actorId: string, input: z.infer<typeof teamSchema>) {
  return transaction(async (tx) => {
    const team = await editableTeam(tx, teamId, actorId);
    if (team.game !== input.game)
      requireCondition(
        !(await tx.tournamentRegistration.count({ where: { teamId } })),
        "Create a separate team for another game once tournament history exists.",
      );
    const updated = await tx.team.update({
      where: { id: teamId },
      data: input,
      include: teamInclude,
    });
    await audit(tx, actorId, "team.updated", "Team", teamId);
    return updated;
  });
}
