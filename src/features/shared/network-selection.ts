/**
 * What the network map currently points at.
 *
 * A sight line is addressable in its own right, not just as a pair of points, so the lab can keep
 * map ↔ points table ↔ observation detail on the same object
 * (PRODUIT-ET-PARCOURS.md §"Espace d'analyse unifié").
 */
export type NetworkSelection =
  | { kind: 'point'; engineName: string }
  | { kind: 'sight'; stationEngineName: string; targetEngineName: string };

export type NetworkSelectionMode = 'replace' | 'toggle';

/**
 * Applies the one selection gesture used by the map and both result tables.
 *
 * A normal click replaces the selection. Ctrl+click toggles one item without clearing the other
 * selected objects. The last entry is the primary selection rendered in the inspector.
 */
export function updateNetworkSelections(
  current: readonly NetworkSelection[],
  next: NetworkSelection | undefined,
  mode: NetworkSelectionMode = 'replace',
): NetworkSelection[] {
  if (!next) return [];
  const existingIndex = current.findIndex((candidate) => isSameSelection(candidate, next));
  if (mode === 'replace') {
    return existingIndex >= 0 && current.length === 1 ? [] : [next];
  }
  if (existingIndex >= 0) return current.filter((_, index) => index !== existingIndex);
  return [...current, next];
}

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
