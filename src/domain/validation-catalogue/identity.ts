import type { ValidationDataset, ValidationTargetBinding } from '@/domain/validation-catalogue/schema';

/**
 * Point identity derived from the dataset's *explicit* `targetBindings.physicalPointId` mapping.
 *
 * This module deliberately never reads `oracle`: identity must stay visible in blind mode, and the
 * two invariants below must hold from the versioned mapping alone (POINT-001/011).
 *
 *  - the same physical point observed under several BTM target names is shared only because the
 *    mapping says so — never because two names look alike;
 *  - the same BTM target name used by several stations for *distinct* physical points stays split,
 *    and is surfaced explicitly so the network is never shown as connected by accident.
 */

export interface SharedPhysicalPointGroup {
  physicalPointId: string;
  /** Bindings that the versioned mapping attaches to this one physical point. */
  members: ValidationTargetBinding[];
  /** Distinct station ids observing it — a group is "shared" only across two or more stations. */
  stationIds: string[];
  /** Distinct raw names in the group; more than one means "same point, different names". */
  rawTargetNames: string[];
}

export interface HomonymGroup {
  rawTargetName: string;
  /** Distinct physical points that legitimately share this BTM target name. */
  members: ValidationTargetBinding[];
  physicalPointIds: string[];
  stationIds: string[];
}

export interface DatasetIdentity {
  /** Physical points confirmed as observed from several stations. */
  sharedPoints: SharedPhysicalPointGroup[];
  /** Same name, different physical points — never linked automatically. */
  homonyms: HomonymGroup[];
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/** Groups bindings by the explicit physical point mapping. */
export function groupBindingsByPhysicalPoint(
  bindings: ValidationTargetBinding[],
): Map<string, ValidationTargetBinding[]> {
  const byPoint = new Map<string, ValidationTargetBinding[]>();
  for (const binding of bindings) {
    const members = byPoint.get(binding.physicalPointId) ?? [];
    members.push(binding);
    byPoint.set(binding.physicalPointId, members);
  }
  return byPoint;
}

/**
 * Derives both identity cases from the mapping only.
 *
 * A shared point requires two or more *distinct stations*: several bindings of one station onto one
 * point (rare, but legal) is not a network connection and must not be presented as one.
 */
export function datasetIdentity(dataset: ValidationDataset): DatasetIdentity {
  const byPoint = groupBindingsByPhysicalPoint(dataset.targetBindings);

  const sharedPoints: SharedPhysicalPointGroup[] = [];
  for (const [physicalPointId, members] of byPoint) {
    const stationIds = unique(members.map((member) => member.stationId));
    if (stationIds.length < 2) continue;
    sharedPoints.push({
      physicalPointId,
      members,
      stationIds,
      rawTargetNames: unique(members.map((member) => member.rawTargetName)),
    });
  }
  sharedPoints.sort((left, right) => left.physicalPointId.localeCompare(right.physicalPointId));

  const byName = new Map<string, ValidationTargetBinding[]>();
  for (const binding of dataset.targetBindings) {
    const members = byName.get(binding.rawTargetName) ?? [];
    members.push(binding);
    byName.set(binding.rawTargetName, members);
  }

  const homonyms: HomonymGroup[] = [];
  for (const [rawTargetName, members] of byName) {
    const physicalPointIds = unique(members.map((member) => member.physicalPointId));
    if (physicalPointIds.length < 2) continue;
    homonyms.push({
      rawTargetName,
      members,
      physicalPointIds,
      stationIds: unique(members.map((member) => member.stationId)),
    });
  }
  homonyms.sort((left, right) => left.rawTargetName.localeCompare(right.rawTargetName));

  return { sharedPoints, homonyms };
}
