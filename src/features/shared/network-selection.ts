/**
 * What the network map currently points at.
 *
 * A sight line is addressable in its own right, not just as a pair of points, so the lab can keep
 * map ↔ points table ↔ observation detail on the same object
 * (FRONTEND-AND-ANALYSIS-LAB.md §"Espace d'analyse unifié").
 */
export type NetworkSelection =
  | { kind: 'point'; engineName: string }
  | { kind: 'sight'; stationEngineName: string; targetEngineName: string };

export function isSameSelection(left?: NetworkSelection, right?: NetworkSelection): boolean {
  if (!left || !right || left.kind !== right.kind) return left === right;
  if (left.kind === 'point' && right.kind === 'point') return left.engineName === right.engineName;
  if (left.kind === 'sight' && right.kind === 'sight') {
    return left.stationEngineName === right.stationEngineName
      && left.targetEngineName === right.targetEngineName;
  }
  return false;
}

/** Engine name a selection refers to: the point itself, or a sight's target. */
export function selectionEngineName(selection?: NetworkSelection): string | undefined {
  if (!selection) return undefined;
  return selection.kind === 'point' ? selection.engineName : selection.targetEngineName;
}
