import { z } from "zod";
import { discoverySchema } from "../../../../../packages/shared/src/tournaments.js";
import { statusOf } from "./domain.js";
import { listTournaments } from "./repository.js";
export { discoverySchema } from "../../../../../packages/shared/src/tournaments.js";

export async function discover(query: z.infer<typeof discoverySchema>) {
  const rows = await listTournaments(query);
  return rows
    .map((t) => ({
      ...t,
      shareTokenHash: undefined,
      status: statusOf(t),
      registeredCount: t._count.registrations,
    }))
    .filter((t) => !query.status || t.status === query.status);
}
