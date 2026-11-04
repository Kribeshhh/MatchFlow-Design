import type { Match, Tournament } from "@prisma/client";
import { requireCondition, type Tx } from "../../database/client.js";
import { engineRulesSchema } from "../../../../../packages/shared/src/engine.js";
import { compareStanding, roundRobin, standings } from "./formats.js";
import { createStage, knockout, nextRound } from "./stages.js";
import { createPairRound, resolveDouble } from "./format-progression.js";
export function splitGroups(ids: string[], count: number) {
  const groups = Array.from({ length: count }, () => [] as string[]);
  ids.forEach((id, i) => {
    const band = Math.floor(i / count),
      index = i % count;
    groups[band % 2 ? count - 1 - index : index].push(id);
  });
  return groups;
}
export async function generateGroups(tx: Tx, event: Tournament, ids: string[]) {
  const rules = engineRulesSchema.parse(event.engineRules).groups;
  requireCondition(rules, "Configure group count and advancing places.");
  const groups = splitGroups(ids, rules.count);
  requireCondition(
    groups.every((group) => group.length > rules.advance && group.length <= 16),
    "Each group needs more participants than advancing places, and at most 16 participants.",
  );
  for (const [groupNumber, group] of groups.entries()) {
    const stage = await createStage(
      tx,
      event.id,
      "ROUND_ROBIN",
      group,
      "GROUP",
      `Group ${String.fromCharCode(65 + groupNumber)}`,
      groupNumber,
    );
    const first = await nextRound(tx, event.id);
    for (const [r, pairs] of roundRobin(group).entries())
      await createPairRound(tx, event.id, stage.id, first + r, "GROUP", pairs);
  }
}
export async function advanceGroups(tx: Tx, event: Tournament, match: Match) {
  await resolveDouble(tx, event.id);
  const current = await tx.tournamentStage.findUniqueOrThrow({
    where: { id: match.stageId! },
    include: { matches: true },
  });
  if (current.kind === "PLAYOFF") {
    if (current.matches.some((m) => m.status !== "COMPLETED")) return;
    const final = current.matches.reduce((a, b) => (a.round > b.round ? a : b));
    requireCondition(final.winnerId, "Playoff final must have a winner.");
    await tx.tournamentStage.update({ where: { id: current.id }, data: { completed: true } });
    await tx.tournament.update({
      where: { id: event.id },
      data: { phase: "COMPLETED", championId: final.winnerId },
    });
    return;
  }
  const rules = engineRulesSchema.parse(event.engineRules).groups!;
  const stages = await tx.tournamentStage.findMany({
    where: { tournamentId: event.id },
    include: { matches: true, participants: { orderBy: { seed: "asc" } } },
    orderBy: { position: "asc" },
  });
  const groups = stages.filter((s) => s.kind === "GROUP");
  const qualifiers: string[][] = [];
  for (const group of groups) {
    if (group.matches.some((m) => m.status !== "COMPLETED")) return;
    const ranking = standings(
      group.participants.map((p) => p.teamId),
      group.matches,
      false,
    );
    const cutoff = ranking[rules.advance - 1];
    const above = ranking
      .filter((row) => compareStanding(row, cutoff, false) < 0)
      .map((row) => row.id);
    const tied = ranking
      .filter((row) => compareStanding(row, cutoff, false) === 0)
      .map((row) => row.id);
    const places = rules.advance - above.length;
    if (tied.length > places) {
      const qualifier = stages.find(
        (s) => s.kind === "QUALIFIER" && s.groupNumber === group.groupNumber,
      );
      if (!qualifier) {
        const created = await createStage(
          tx,
          event.id,
          "SINGLE_ELIMINATION",
          tied,
          "QUALIFIER",
          `${group.name} qualification (${places} places)`,
          group.groupNumber!,
        );
        await knockout(tx, event.id, created.id, tied, "GROUP_QUALIFIER", places);
        await resolveDouble(tx, event.id);
        return;
      }
      if (qualifier.matches.some((m) => m.status !== "COMPLETED")) return;
      const last = Math.max(...qualifier.matches.map((m) => m.round));
      qualifiers.push([
        ...above,
        ...qualifier.matches.filter((m) => m.round === last).map((m) => m.winnerId!),
      ]);
      await tx.tournamentStage.update({ where: { id: qualifier.id }, data: { completed: true } });
    } else qualifiers.push([...above, ...tied]);
    await tx.tournamentStage.update({ where: { id: group.id }, data: { completed: true } });
  }
  if (stages.some((s) => s.kind === "PLAYOFF")) return;
  const seeds = Array.from({ length: rules.advance }, (_, place) =>
    qualifiers.map((group) => group[place]),
  ).flat();
  requireCondition(
    seeds.every(Boolean) && new Set(seeds).size === seeds.length,
    "Group qualification produced an invalid playoff field.",
  );
  const stage = await createStage(
    tx,
    event.id,
    "SINGLE_ELIMINATION",
    seeds,
    "PLAYOFF",
    "Championship playoffs",
  );
  await knockout(tx, event.id, stage.id, seeds, "PLAYOFF");
  await resolveDouble(tx, event.id);
}
