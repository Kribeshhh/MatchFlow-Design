import { test } from "node:test";
import assert from "node:assert/strict";
import { doubleElimination } from "../../apps/api/src/modules/brackets/double-elimination.js";
import {
  roundRobin,
  swissPairs,
  type Played,
} from "../../apps/api/src/modules/brackets/formats.js";
test("round robin covers every opponent once, with balanced byes", () => {
  for (let n = 2; n <= 16; n++) {
    const ids = Array.from({ length: n }, (_, i) => String(i));
    const seen = new Set<string>();
    for (const pairs of roundRobin(ids)) {
      const active = pairs.flat().filter(Boolean);
      assert.equal(new Set(active).size, n);
      for (const [a, b] of pairs)
        if (a && b) {
          const key = [a, b].sort().join(":");
          assert(!seen.has(key));
          seen.add(key);
        }
    }
    assert.equal(seen.size, (n * (n - 1)) / 2);
  }
});
test("Swiss rounds have no repeat opponents or repeat byes", () => {
  for (let n = 2; n <= 16; n++)
    for (let run = 0; run < 12; run++) {
      const ids = Array.from({ length: n }, (_, i) => String(i));
      const matches: Played[] = [];
      for (let r = 0; r < Math.ceil(Math.log2(n)); r++) {
        const pairs = swissPairs(ids, matches);
        assert.equal(new Set(pairs.flat().filter((id) => id !== null)).size, n);
        for (const [a, b] of pairs)
          matches.push({
            teamAId: a,
            teamBId: b,
            winnerId: b && (run + r + Number(a)) % 2 ? b : a,
            isBye: !a || !b,
            status: "COMPLETED",
            scoreA: 2,
            scoreB: 1,
          });
      }
    }
});
test("double elimination eliminates only after two losses, including uneven seeds", () => {
  for (let n = 2; n <= 64; n++)
    for (const upset of [false, true]) {
      const ids = Array.from({ length: n }, (_, i) => String(i));
      const plan = doubleElimination("event", "stage", ids);
      const resolved = new Map<string, { winner: string | null; loser: string | null }>();
      const losses = new Map(ids.map((id) => [id, 0]));
      let champion: string | null = null;
      for (const m of plan) {
        const take = (
          id: string | null | undefined,
          outcome: string | undefined,
          fallback: string | null | undefined,
        ) =>
          id ? resolved.get(id)![outcome === "LOSER" ? "loser" : "winner"] : (fallback ?? null);
        const a = take(m.sourceAId, m.sourceAOutcome, m.teamAId),
          b = take(m.sourceBId, m.sourceBOutcome, m.teamBId);
        if (a) assert(losses.get(a)! < 2);
        if (b) assert(losses.get(b)! < 2);
        const winner = upset && b ? b : a || b,
          loser = a && b ? (winner === a ? b : a) : null;
        if (loser) losses.set(loser, losses.get(loser)! + 1);
        resolved.set(m.id!, { winner, loser });
        champion = winner;
        if (m.bracket === "GRAND_FINAL" && winner === b) {
          losses.set(b!, losses.get(b!)! + 1);
          champion = a;
        }
      }
      assert(champion);
      assert.equal(
        [...losses].filter(([id]) => id !== champion).every(([, value]) => value === 2),
        true,
      );
    }
});

test("standings compare KDA before win duration without floating-point equality", async () => {
  const { compareStanding } = await import("../../apps/api/src/modules/brackets/formats.js");
  const a = {
    wins: 2,
    byes: 0,
    buchholz: 3,
    difference: 2,
    kills: 10,
    assists: 5,
    deaths: 5,
    winningSeconds: 1200,
  };
  assert(compareStanding(a, { ...a, kills: 5, winningSeconds: 200 }, false) < 0);
  assert(compareStanding(a, { ...a, winningSeconds: 1300 }, false) < 0);
  assert.equal(compareStanding(a, { ...a, kills: 20, assists: 10, deaths: 10 }, false), 0);
  assert(compareStanding(a, { ...a, buchholz: 4 }, true) > 0);
  assert.equal(compareStanding(a, { ...a, buchholz: 4 }, false), 0);
});
