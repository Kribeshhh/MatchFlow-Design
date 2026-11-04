import type { RegistrationStatus } from "@prisma/client";
import type { Tx } from "../../database/client.js";
export const activeRegistrations = (tx: Tx, tournamentId: string, ignoreId?: string) =>
  tx.tournamentRegistration.findMany({
    where: {
      tournamentId,
      status: { in: ["PENDING", "APPROVED"] },
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
    },
  });
export const findRegistration = (tx: Tx, id: string) =>
  tx.tournamentRegistration.findUnique({ where: { id } });
export const findTeamEntry = (tx: Tx, tournamentId: string, teamId: string) =>
  tx.tournamentRegistration.findUnique({
    where: { tournamentId_teamId: { tournamentId, teamId } },
  });
export const insertEntry = (
  tx: Tx,
  tournamentId: string,
  teamId: string,
  status: RegistrationStatus,
  roster: { id: string; username: string }[],
) => tx.tournamentRegistration.create({ data: { tournamentId, teamId, status, roster } });
export const deleteEntry = (tx: Tx, id: string) =>
  tx.tournamentRegistration.delete({ where: { id } });
export const setStatus = (tx: Tx, id: string, status: RegistrationStatus) =>
  tx.tournamentRegistration.update({ where: { id }, data: { status } });
