/** Pure competition plans. Seed order is supplied by the caller. */
export type Played = {
  teamAId: string | null;
  teamBId: string | null;
  winnerId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  isBye: boolean;
  status: string;
  killsA?: number | null;
  deathsA?: number | null;
  assistsA?: number | null;
  killsB?: number | null;
  deathsB?: number | null;
  assistsB?: number | null;
  durationSeconds?: number | null;
  outcome?: string;
};
export function standings(ids: string[], matches: Played[], swiss = true) {
  const rows = ids.map((id, seed) => ({
    id,
    seed,
    wins: 0,
    draws: 0,
    timedWins: 0,
    losses: 0,
    byes: 0,
    difference: 0,
    buchholz: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    winningSeconds: 0,
    kda: 0,
    averageWinSeconds: 0,
  }));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const m of matches) {
    if (m.status !== "COMPLETED" || (!m.winnerId && m.outcome !== "DRAW")) continue;
    if (m.isBye) {
      const row = m.winnerId && byId.get(m.winnerId);
      if (row) row.byes++;
      continue;
    }
    for (const [id, score, other] of [
      [m.teamAId, m.scoreA, m.scoreB],
      [m.teamBId, m.scoreB, m.scoreA],
    ] as const) {
      const row = id && byId.get(id);
      if (!row) continue;
      if (m.outcome === "DRAW") row.draws++;
      else if (id === m.winnerId) row.wins++;
      else row.losses++;
      const side = id === m.teamAId ? "A" : "B";
      row.kills += m[side === "A" ? "killsA" : "killsB"] ?? 0;
      row.deaths += m[side === "A" ? "deathsA" : "deathsB"] ?? 0;
      row.assists += m[side === "A" ? "assistsA" : "assistsB"] ?? 0;
      if (id === m.winnerId && m.durationSeconds) {
        row.winningSeconds += m.durationSeconds;
        row.timedWins++;
      }
      row.difference += (score ?? 0) - (other ?? 0);
    }
  }
  for (const m of matches) {
    if (m.status !== "COMPLETED" || m.isBye) continue;
    const a = m.teamAId && byId.get(m.teamAId),
      b = m.teamBId && byId.get(m.teamBId);
    if (a && b) {
      a.buchholz += b.wins + b.byes;
      b.buchholz += a.wins + a.byes;
    }
  }
  for (const row of rows) {
    row.kda = (row.kills + row.assists) / Math.max(1, row.deaths);
    row.averageWinSeconds = row.timedWins ? row.winningSeconds / row.timedWins : 0;
  }
  return rows.sort((a, b) => compareStanding(a, b, swiss) || a.seed - b.seed);
}
export function roundRobin(ids: string[]) {
  const ring: (string | null)[] = [...ids];
  if (ring.length % 2) ring.push(null);
  const rounds: [string | null, string | null][][] = [];
  for (let r = 0; r < ring.length - 1; r++) {
    rounds.push(
      Array.from({ length: ring.length / 2 }, (_, i) => [ring[i], ring[ring.length - 1 - i]]),
    );
    ring.splice(1, 0, ring.pop()!);
  }
  return rounds;
}
/** Exact no-rematch matching (bounded to 16 entrants); lowest-ranked eligible player gets a bye. */
export function swissPairs(ids: string[], matches: Played[]): [string | null, string | null][] {
  const ranked = standings(ids, matches);
  const seen = new Set(
    matches
      .filter((m) => !m.isBye)
      .flatMap((m) => [m.teamAId + ":" + m.teamBId, m.teamBId + ":" + m.teamAId]),
  );
  const pair = (remaining: string[]): [string, string][] | null => {
    if (!remaining.length) return [];
    const [a, ...rest] = remaining;
    for (let i = 0; i < rest.length; i++) {
      if (seen.has(a + ":" + rest[i])) continue;
      const tail = pair(rest.filter((_, j) => i !== j));
      if (tail) return [[a, rest[i]], ...tail];
    }
    return null;
  };
  if (ids.length % 2 === 0) {
    const result = pair(ranked.map((r) => r.id));
    if (!result) throw new Error("No valid Swiss pairing remains.");
    return result;
  }
  for (const bye of [...ranked].reverse().sort((a, b) => a.byes - b.byes)) {
    if (bye.byes) continue;
    const result = pair(ranked.filter((r) => r.id !== bye.id).map((r) => r.id));
    if (result) return [...result, [bye.id, null]];
  }
  throw new Error("No valid Swiss pairing remains.");
}

export function compareStanding(
  a: {
    wins: number;
    byes: number;
    buchholz: number;
    difference: number;
    kills: number;
    assists: number;
    deaths: number;
    winningSeconds: number;
    timedWins?: number;
  },
  b: typeof a,
  swiss: boolean,
) {
  return (
    b.wins + (swiss ? b.byes : 0) - (a.wins + (swiss ? a.byes : 0)) ||
    (swiss ? b.buchholz - a.buchholz : 0) ||
    b.difference - a.difference ||
    (b.kills + b.assists) * Math.max(1, a.deaths) - (a.kills + a.assists) * Math.max(1, b.deaths) ||
    compareTime(a, b)
  );
}

function compareTime(a: { wins: number; timedWins?: number; winningSeconds: number }, b: typeof a) {
  const na = a.timedWins ?? a.wins,
    nb = b.timedWins ?? b.wins;
  if (!na || !nb) return na ? -1 : nb ? 1 : 0;
  return a.winningSeconds * nb - b.winningSeconds * na;
}
