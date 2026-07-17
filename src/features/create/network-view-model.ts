import type { WizardDraft, DraftInitialisationResult } from '@/demo/draft';

export interface NetworkViewNode {
  id: string;
  label: string;
  kind: 'station' | 'point';
  eastingM: number;
  northingM: number;
  heightM: number;
  stationCodes: string[];
  observationCount?: number;
  status?: 'computed' | 'review';
}

export interface NetworkViewLink {
  id: string;
  stationCode: string;
  stationNodeId: string;
  pointNodeId: string;
}

export interface NetworkViewModel {
  stationCodes: string[];
  nodes: NetworkViewNode[];
  links: NetworkViewLink[];
}

function sourceKey(stationCode: string, rawTargetName: string): string {
  return `${stationCode}|${rawTargetName}`;
}

/**
 * Resolves the point key exactly as draft initialisation does: members of one confirmed shared
 * physical point use the first member's engine name, while individual targets keep their own.
 */
export function draftPointKeyBySource(draft: WizardDraft): Map<string, string> {
  const keyBySource = new Map(draft.targets.map((target) => [
    sourceKey(target.stationCode, target.rawTargetName),
    target.engineName,
  ]));

  for (const shared of draft.sharedPoints) {
    const primaryMember = shared.members[0];
    if (!primaryMember) continue;
    const primary = draft.targets.find(
      (target) =>
        target.stationCode === primaryMember.stationCode && target.rawTargetName === primaryMember.rawTargetName,
    );
    if (!primary) continue;
    for (const member of shared.members) {
      keyBySource.set(sourceKey(member.stationCode, member.rawTargetName), primary.engineName);
    }
  }
  return keyBySource;
}

/** Builds the graph used by the interactive initial-coordinate network view. */
export function buildNetworkViewModel(
  draft: WizardDraft,
  result: DraftInitialisationResult,
): NetworkViewModel {
  const pointKeyBySource = draftPointKeyBySource(draft);
  const stationCodesByPoint = new Map<string, Set<string>>();

  for (const target of draft.targets.filter((item) => item.includeInAdjustment)) {
    const pointKey = pointKeyBySource.get(sourceKey(target.stationCode, target.rawTargetName));
    if (!pointKey) continue;
    const stations = stationCodesByPoint.get(pointKey) ?? new Set<string>();
    stations.add(target.stationCode);
    stationCodesByPoint.set(pointKey, stations);
  }

  const stationNodes: NetworkViewNode[] = result.stationSolutions.map((station) => ({
    id: `station:${station.stationCode}`,
    label: station.stationCode,
    kind: 'station',
    eastingM: station.eastingM,
    northingM: station.northingM,
    heightM: station.heightM,
    stationCodes: [station.stationCode],
  }));

  const pointNodes: NetworkViewNode[] = result.coordinates.map((coordinate) => ({
    id: `point:${coordinate.pointKey}`,
    label: coordinate.pointKey,
    kind: 'point',
    eastingM: coordinate.eastingM,
    northingM: coordinate.northingM,
    heightM: coordinate.heightM,
    stationCodes: [...(stationCodesByPoint.get(coordinate.pointKey) ?? new Set<string>())],
    observationCount: coordinate.observationCount,
    status: coordinate.status,
  }));

  const stationNodeIds = new Set(stationNodes.map((node) => node.id));
  const pointNodeIds = new Set(pointNodes.map((node) => node.id));
  const links: NetworkViewLink[] = [];
  for (const point of pointNodes) {
    for (const stationCode of point.stationCodes) {
      const stationNodeId = `station:${stationCode}`;
      if (!stationNodeIds.has(stationNodeId) || !pointNodeIds.has(point.id)) continue;
      links.push({
        id: `${stationCode}|${point.id}`,
        stationCode,
        stationNodeId,
        pointNodeId: point.id,
      });
    }
  }

  return {
    stationCodes: draft.stationCodes.filter((stationCode) =>
      stationNodes.some((node) => node.label === stationCode),
    ),
    nodes: [...stationNodes, ...pointNodes],
    links,
  };
}

export interface NetworkBounds {
  minEastingM: number;
  maxEastingM: number;
  minNorthingM: number;
  maxNorthingM: number;
}

export function networkBounds(nodes: readonly NetworkViewNode[]): NetworkBounds {
  if (nodes.length === 0) {
    return { minEastingM: 0, maxEastingM: 1, minNorthingM: 0, maxNorthingM: 1 };
  }
  const eastings = nodes.map((node) => node.eastingM);
  const northings = nodes.map((node) => node.northingM);
  const minEastingM = Math.min(...eastings);
  const maxEastingM = Math.max(...eastings);
  const minNorthingM = Math.min(...northings);
  const maxNorthingM = Math.max(...northings);
  return {
    minEastingM,
    maxEastingM: maxEastingM === minEastingM ? maxEastingM + 1 : maxEastingM,
    minNorthingM,
    maxNorthingM: maxNorthingM === minNorthingM ? maxNorthingM + 1 : maxNorthingM,
  };
}
