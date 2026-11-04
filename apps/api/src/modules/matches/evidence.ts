import { z } from "zod";
const matchEvidence = z.object({
  round: z.number(),
  position: z.number(),
  teamAId: z.string().nullable(),
  teamBId: z.string().nullable(),
  scoreA: z.number().nullable(),
  scoreB: z.number().nullable(),
  winnerId: z.string().nullable(),
  outcome: z.string().optional(),
  status: z.string(),
});
const lobbyEvidence = z.object({
  number: z.number(),
  results: z.array(
    z.object({
      teamId: z.string(),
      placement: z.number().nullable(),
      eliminations: z.number(),
      noShow: z.boolean(),
    }),
  ),
});
/** A safe human-readable projection; never expose arbitrary snapshot keys in the UI. */
export function evidenceLines(snapshot: unknown, names: Map<string, string>) {
  const lines: string[] = [];
  const name = (id: string | null) => (id ? names.get(id) || "Former participant" : "Unassigned");
  function visit(value: unknown, label: string) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, label);
      return;
    }
    const match = matchEvidence.safeParse(value);
    if (match.success) {
      const m = match.data;
      lines.push(
        `${label} · R${m.round}/M${m.position + 1}: ${name(m.teamAId)} ${m.scoreA ?? "—"} : ${m.scoreB ?? "—"} ${name(m.teamBId)} · ${m.outcome || m.status}${m.winnerId ? ` · Winner: ${name(m.winnerId)}` : ""}`,
      );
      return;
    }
    const lobby = lobbyEvidence.safeParse(value);
    if (lobby.success) {
      for (const r of lobby.data.results)
        lines.push(
          `${label} · Lobby ${lobby.data.number} · ${name(r.teamId)}: ${r.noShow ? "Did not start" : `placement ${r.placement}, ${r.eliminations} eliminations`}`,
        );
      return;
    }
  }
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const record = snapshot as Record<string, unknown>;
    for (const [key, label] of [
      ["before", "Before"],
      ["after", "After"],
      ["target", "Disputed result"],
      ["voidedMatches", "Voided result"],
      ["voidedRounds", "Voided lobby"],
      ["matches", "Previous match"],
      ["rounds", "Previous lobby"],
    ] as const)
      if (key in record) visit(record[key], label);
  }
  return lines;
}
