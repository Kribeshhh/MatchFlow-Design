import type { Match, Tournament } from "@prisma/client";
import { requireCondition, type Tx } from "../../database/client.js";
import { engineRulesSchema, type EngineRules } from "../../../../../packages/shared/src/engine.js";
import { standings, compareStanding, roundRobin, type Played } from "./formats.js";
import { createPairRound, resolveDouble } from "./format-progression.js";
import { createStage, knockout } from "./stages.js";
export function leagueStandings(
  ids: string[],
  matches: Played[],
  rules: NonNullable<EngineRules["league"]>,
) {
  return standings(ids, matches, false)
    .map((row) => ({
      ...row,
      points:
        row.wins * rules.winPoints + row.draws * rules.drawPoints + row.losses * rules.lossPoints,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        compareStanding({ ...a, wins: 0, byes: 0 }, { ...b, wins: 0, byes: 0 }, false) ||
        a.seed - b.seed,
    );
}
export async function generateLeague(tx: Tx, event: Tournament, ids: string[]) {
  const rules = engineRulesSchema.parse(event.engineRules).league;
  requireCondition(rules, "Configure league points and cycles.");
  requireCondition(ids.length <= 16, "Leagues support up to 16 participants.");
  const stage = await createStage(tx, event.id, "LEAGUE", ids, "MAIN", "League season");
  const rounds = roundRobin(ids);
  for (let cycle = 0; cycle < rules.cycles; cycle++)
    for (const [r, pairs] of rounds.entries())
      await createPairRound(
        tx,
        event.id,
        stage.id,
        cycle * rounds.length + r + 1,
        "LEAGUE",
        cycle % 2 ? pairs.map(([a, b]) => [b, a]) : pairs,
      );
}
export async function advanceLeague(tx: Tx, event: Tournament, match: Match) {
  const stage = await tx.tournamentStage.findUniqueOrThrow({
    where: { id: match.stageId! },
    include: { matches: true, participants: { orderBy: { seed: "asc" } } },
  });
  if (stage.kind === "PLAYOFF") {
    await resolveDouble(tx, event.id);
    const matches = await tx.match.findMany({ where: { stageId: stage.id } });
    if (matches.some((m) => m.status !== "COMPLETED")) return;
    const winner = matches.reduce((a, b) => (a.round > b.round ? a : b)).winnerId;
    requireCondition(winner, "The championship playoff requires a winner.");
    await tx.tournamentStage.update({ where: { id: stage.id }, data: { completed: true } });
    await tx.tournament.update({
      where: { id: event.id },
      data: { phase: "COMPLETED", championId: winner },
    });
    return;
  }
  if (stage.matches.some((m) => m.status !== "COMPLETED")) return;
  const rules = engineRulesSchema.parse(event.engineRules).league!;
  const ranking = leagueStandings(
    stage.participants.map((p) => p.teamId),
    stage.matches,
    rules,
  );
  const top = ranking[0],
    tied = ranking.filter(
      (row) =>
        row.points === top.points &&
        compareStanding({ ...row, wins: 0, byes: 0 }, { ...top, wins: 0, byes: 0 }, false) === 0,
    );
  await tx.tournamentStage.update({ where: { id: stage.id }, data: { completed: true } });
  if (tied.length === 1) {
    await tx.tournament.update({
      where: { id: event.id },
      data: { phase: "COMPLETED", championId: top.id },
    });
    return;
  }
  const playoffs = await createStage(
    tx,
    event.id,
    "SINGLE_ELIMINATION",
    tied.map((r) => r.id),
    "PLAYOFF",
    "League championship playoff",
  );
  await knockout(
    tx,
    event.id,
    playoffs.id,
    tied.map((r) => r.id),
    "PLAYOFF",
  );
  await resolveDouble(tx, event.id);
}
