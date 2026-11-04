import { db, ApiError } from "../../database/client.js";
import { digest } from "./tokens.js";
export async function throttle(kind: string, identity: string, limit = 10, windowMs = 15 * 60000) {
  const key = digest(`${kind}:${identity}`);
  // Single SQL statement makes the fixed window/count atomic across API instances.
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "AuthThrottle" ("key","count","resetsAt") VALUES (${key},1,((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ${windowMs} * INTERVAL '1 millisecond')) ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "AuthThrottle"."resetsAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1 ELSE "AuthThrottle"."count"+1 END,"resetsAt"=CASE WHEN "AuthThrottle"."resetsAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ${windowMs} * INTERVAL '1 millisecond') ELSE "AuthThrottle"."resetsAt" END RETURNING "count"`;
  if (rows[0].count > limit) throw new ApiError(429, "Too many attempts. Please try again later.");
}
