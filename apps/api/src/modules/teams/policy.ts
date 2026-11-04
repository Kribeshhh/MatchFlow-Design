import { requireCondition, type Tx } from "../../database/client.js";
import { findTeam } from "./repository.js";
export async function editableTeam(tx: Tx, id: string, captain: string) {
  await requireTeamActor(tx, captain);
  const team = await findTeam(id, tx);
  requireCondition(team?.competitionType === "TEAM", "Team not found.", 404);
  requireCondition(
    team.captainId === captain || team.members.some((m) => m.userId === captain && m.manager),
    "Only the captain or a team manager can change this roster.",
    403,
  );
  requireCondition(!team.restrictedAt, "This team is restricted by platform moderation.", 403);
  requireCondition(!team.archivedAt, "This team is archived.");
  return team;
}

export async function requireTeamActor(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { status: true, roles: true, verificationRequired: true, emailVerifiedAt: true },
  });
  requireCondition(
    user?.status === "ACTIVE" &&
      user.roles.includes("PLAYER") &&
      (!user.verificationRequired || user.emailVerifiedAt),
    "Your account cannot perform this action.",
    403,
  );
}
