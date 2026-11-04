import type { Match, Tournament } from "@prisma/client";
/** Computes result dependencies, not merely the next visual column. */
export function impactedMatches(
  event: Pick<Tournament, "format">,
  target: Match,
  matches: Match[],
  stages: { id: string; kind: string; groupNumber: number | null }[],
) {
  const affected = new Set<string>();
  if (event.format === "SWISS" && target.bracket !== "TIEBREAK")
    for (const m of matches) {
      if (m.round > target.round) affected.add(m.id);
    }
  if (["ROUND_ROBIN", "LEAGUE"].includes(event.format)) {
    if (
      target.bracket !== "TIEBREAK" &&
      stages.find((s) => s.id === target.stageId)?.kind !== "PLAYOFF"
    )
      for (const m of matches)
        if (m.bracket === "TIEBREAK" || stages.find((s) => s.id === m.stageId)?.kind === "PLAYOFF")
          affected.add(m.id);
  }
  if (event.format === "GROUPS") {
    const stage = stages.find((s) => s.id === target.stageId);
    for (const m of matches) {
      const other = stages.find((s) => s.id === m.stageId);
      if (
        stage?.kind === "GROUP" &&
        (other?.kind === "PLAYOFF" ||
          (other?.kind === "QUALIFIER" && other.groupNumber === stage.groupNumber))
      )
        affected.add(m.id);
      if (stage?.kind === "QUALIFIER" && other?.kind === "PLAYOFF") affected.add(m.id);
    }
  }
  const visited = new Set([target.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of matches) {
      const dependency = Boolean(
        (m.sourceAId && visited.has(m.sourceAId)) || (m.sourceBId && visited.has(m.sourceBId)),
      );
      const legacy =
        !m.sourceAId &&
        !m.sourceBId &&
        (event.format === "SINGLE_ELIMINATION" || target.bracket === "TIEBREAK") &&
        matches.some(
          (parent) =>
            visited.has(parent.id) &&
            parent.stageId === m.stageId &&
            m.round === parent.round + 1 &&
            m.position === Math.floor(parent.position / 2),
        );
      if ((dependency || legacy || affected.has(m.id)) && !visited.has(m.id)) {
        visited.add(m.id);
        affected.add(m.id);
        changed = true;
      }
    }
  }
  affected.delete(target.id);
  return matches.filter((m) => affected.has(m.id));
}
