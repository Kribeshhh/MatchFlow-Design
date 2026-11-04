import type { Tournament } from "@prisma/client";
export function statusOf(t: Tournament) {
  if (!["REGISTRATION", "PUBLISHED"].includes(t.phase)) return t.phase;
  if (new Date() < t.opensAt) return "UPCOMING";
  return new Date() < t.closesAt ? "REGISTRATION_OPEN" : "REGISTRATION_CLOSED";
}

export const beforePlay = (phase: string) =>
  ["REGISTRATION", "PUBLISHED", "CHECK_IN"].includes(phase);
