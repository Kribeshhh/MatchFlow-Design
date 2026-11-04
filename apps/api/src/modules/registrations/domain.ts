import { z } from "zod";
export const rosterSchema = z.array(z.object({ id: z.string(), username: z.string() }));
export const rosterOf = (value: unknown) => rosterSchema.parse(value);
export const isParticipant = (roster: unknown, userId?: string) =>
  Boolean(userId && rosterOf(roster).some((p) => p.id === userId));
export function canReadEntry(
  entry: { status: string; roster: unknown },
  ownerId: string,
  viewerId?: string,
) {
  return (
    entry.status === "APPROVED" || ownerId === viewerId || isParticipant(entry.roster, viewerId)
  );
}
