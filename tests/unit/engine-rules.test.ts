import { test } from "node:test";
import assert from "node:assert/strict";
import { tournamentSchema } from "../../packages/shared/src/tournaments.js";
import { engineRulesSchema } from "../../packages/shared/src/engine.js";
import { resultSchema } from "../../packages/shared/src/matches.js";
const base = {
  name: "Rules test",
  game: "valorant",
  description: "Validate competition settings.",
  rules: "Follow the published event rules.",
  teamSize: 1,
  maxTeams: 8,
  opensAt: "2030-01-01T00:00:00Z",
  closesAt: "2030-01-02T00:00:00Z",
  startsAt: "2030-01-03T00:00:00Z",
};
test("format contracts require explicit coherent native rules and retain legacy defaults", () => {
  assert(tournamentSchema.safeParse(base).success);
  for (const format of ["GROUPS", "LEAGUE", "BATTLE_ROYALE"])
    assert(!tournamentSchema.safeParse({ ...base, format }).success);
  assert(
    tournamentSchema.safeParse({
      ...base,
      format: "GROUPS",
      engineRules: { groups: { count: 2, advance: 2 } },
    }).success,
  );
  assert(
    !tournamentSchema.safeParse({
      ...base,
      format: "GROUPS",
      maxTeams: 4,
      engineRules: { groups: { count: 2, advance: 2 } },
    }).success,
  );
  const league = { cycles: 2, winPoints: 3, drawPoints: 1, lossPoints: 0, allowDraws: true };
  assert(
    tournamentSchema.safeParse({ ...base, format: "LEAGUE", engineRules: { league } }).success,
  );
  assert(
    !tournamentSchema.safeParse({
      ...base,
      format: "LEAGUE",
      matchFormat: "BO3",
      engineRules: { league },
    }).success,
  );
  assert(
    !tournamentSchema.safeParse({ ...base, format: "SWISS", engineRules: { league } }).success,
  );
  const battle = {
    rounds: 4,
    placementPoints: [10, 6, 4, 0],
    eliminationPoints: 1,
    tieBreakers: ["ELIMINATIONS", "LAST_ROUND_PLACEMENT"],
  };
  assert(
    tournamentSchema.safeParse({
      ...base,
      game: "pubg",
      format: "BATTLE_ROYALE",
      engineRules: { battle },
    }).success,
  );
  assert(!engineRulesSchema.safeParse({ battle: { ...battle, placementPoints: [1, 5] } }).success);
  assert(
    !engineRulesSchema.safeParse({ battle: { ...battle, tieBreakers: ["WINS", "WINS"] } }).success,
  );
  assert(
    !engineRulesSchema.safeParse({
      battle: { ...battle, placementPoints: [0], eliminationPoints: 0 },
    }).success,
  );
});
test("administrative outcomes require a real participant and reason without manufactured statistics", () => {
  assert(
    resultSchema.safeParse({
      outcome: "FORFEIT",
      winnerId: "participant",
      reason: "Participant conceded the match",
    }).success,
  );
  assert(
    !resultSchema.safeParse({
      outcome: "FORFEIT",
      winnerId: "participant",
      reason: "Participant conceded the match",
      scoreA: 1,
      scoreB: 0,
    }).success,
  );
  assert(
    !resultSchema.safeParse({ outcome: "NO_SHOW", winnerId: "participant", reason: "short" })
      .success,
  );
  assert(!resultSchema.safeParse({ outcome: "PLAYED", scoreA: 1 }).success);
});
