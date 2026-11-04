import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { requireCondition, type Tx } from "../../database/client.js";
export const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function replay<T>(
  tx: Tx,
  actorId: string,
  key: string | undefined,
  payload: unknown,
): Promise<T | undefined> {
  if (!key) return undefined;
  const command = await tx.engineCommand.findUnique({ where: { actorId_key: { actorId, key } } });
  if (!command) return undefined;
  requireCondition(
    command.requestHash === fingerprint(payload),
    "This request key was already used for a different operation.",
    409,
  );
  return command.response as T;
}
export async function remember(
  tx: Tx,
  tournamentId: string,
  actorId: string,
  key: string | undefined,
  payload: unknown,
  response: unknown,
) {
  if (key)
    await tx.engineCommand.create({
      data: {
        tournamentId,
        actorId,
        key,
        requestHash: fingerprint(payload),
        response: json(response),
      },
    });
}
export async function history(
  tx: Tx,
  tournamentId: string,
  actorId: string | null,
  action: string,
  snapshot: unknown,
  matchId?: string,
  reason = "",
) {
  await tx.engineHistory.create({
    data: { tournamentId, actorId, action, matchId, reason, snapshot: json(snapshot) },
  });
  await tx.tournament.update({
    where: { id: tournamentId },
    data: { engineVersion: { increment: 1 } },
  });
}
