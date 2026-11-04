import { randomInt } from "node:crypto";
import { requireCondition } from "../../database/client.js";
export type Seeding = { seeding?: "REGISTRATION" | "RANDOM" | "MANUAL"; teamIds?: string[] };
/** Fisher–Yates uses Node's unbiased cryptographic randomInt. Never accepts foreign entrants. */
export function seedParticipants<T extends { teamId: string }>(
  entries: T[],
  options: Seeding = {},
): T[] {
  const result = [...entries];
  if (options.seeding === "MANUAL") {
    const ids = options.teamIds || [];
    requireCondition(
      ids.length === entries.length &&
        new Set(ids).size === entries.length &&
        entries.every((entry) => ids.includes(entry.teamId)),
      "Manual seeds must contain every approved participant exactly once.",
    );
    const byId = new Map(entries.map((entry) => [entry.teamId, entry]));
    return ids.map((id) => byId.get(id)!);
  }
  requireCondition(!options.teamIds?.length, "An explicit seed order requires manual seeding.");
  if (options.seeding === "RANDOM")
    for (let i = result.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
  return result;
}
