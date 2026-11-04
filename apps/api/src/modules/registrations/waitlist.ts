import { ApiError, type Tx } from "../../database/client.js";
import { audit } from "../administration/audit.js";
import { statusOf } from "../tournaments/domain.js";
import { eligible } from "./policy.js";
import { rosterOf } from "./domain.js";
export async function promoteWaitlist(tx: Tx, tournamentId: string, actorId: string) {
  const event = await tx.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  if (!event.waitlistEnabled || statusOf(event) !== "REGISTRATION_OPEN") return;
  let remaining =
    event.maxTeams -
    (await tx.tournamentRegistration.count({
      where: { tournamentId, status: { in: ["PENDING", "APPROVED"] } },
    }));
  if (remaining <= 0) return;
  const queue = await tx.tournamentRegistration.findMany({
    where: { tournamentId, status: "WAITLISTED" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  for (const entry of queue) {
    if (!remaining) break;
    try {
      const { starters } = await eligible(tx, tournamentId, entry.teamId, entry.id);
      const snapshot = rosterOf(entry.roster);
      if (
        snapshot.length !== starters.length ||
        !starters.every((m) => snapshot.some((p) => p.id === m.userId))
      )
        throw new ApiError(400, "Roster changed");
      await tx.tournamentRegistration.update({
        where: { id: entry.id },
        data: { status: "PENDING", waitlistReason: "" },
      });
      await audit(
        tx,
        actorId,
        "registration.waitlist.promoted",
        "TournamentRegistration",
        entry.id,
      );
      remaining--;
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      await tx.tournamentRegistration.update({
        where: { id: entry.id },
        data: {
          waitlistReason:
            "This saved entry is not currently eligible. Withdraw and register an eligible roster again before the deadline.",
        },
      });
    }
  }
}
