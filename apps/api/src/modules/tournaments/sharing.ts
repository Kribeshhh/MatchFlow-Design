import type { RequestHandler } from "express";
import { randomBytes } from "node:crypto";
import { db, transaction, requireCondition } from "../../database/client.js";
import { digest } from "../auth/tokens.js";
import { owned } from "./policy.js";
import { audit } from "../administration/audit.js";
declare global {
  namespace Express {
    interface Request {
      eventAccessIds?: string[];
    }
  }
}
export const sharedAccess: RequestHandler = async (req, _res, next) => {
  const cookies = Object.entries(req.cookies || {})
    .filter(
      ([name, token]) =>
        /^mf_event_c[a-z0-9]+$/.test(name) &&
        typeof token === "string" &&
        /^[a-f0-9]{64}$/.test(token),
    )
    .slice(0, 10);
  req.eventAccessIds = cookies.length
    ? (
        await db.tournament.findMany({
          where: {
            OR: cookies.map(([name, token]) => ({
              id: name.slice(9),
              shareTokenHash: digest(String(token)),
              visibility: "PRIVATE",
              phase: { not: "DRAFT" },
            })),
          },
          select: { id: true },
        })
      ).map((t) => t.id)
    : [];
  next();
};
export function rotateShareLink(id: string, actorId: string) {
  return transaction(async (tx) => {
    const event = await owned(tx, id, actorId);
    requireCondition(event.visibility === "PRIVATE", "Only private events need share links.");
    const token = randomBytes(32).toString("hex");
    await tx.tournament.update({ where: { id }, data: { shareTokenHash: digest(token) } });
    await audit(tx, actorId, "tournament.share.rotated", "Tournament", id);
    return { token };
  });
}
export async function redeemShareLink(id: string, token: string) {
  const event = await db.tournament.findFirst({
    where: { id, visibility: "PRIVATE", phase: { not: "DRAFT" }, shareTokenHash: digest(token) },
    select: { id: true },
  });
  requireCondition(event, "This tournament link is unavailable.", 404);
}
