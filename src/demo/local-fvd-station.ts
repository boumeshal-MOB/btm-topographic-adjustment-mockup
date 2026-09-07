import manifestJson from '@/demo/fixtures/fvd-sta3.generated/manifest.json';
import {
  localFrNetworkFixtures,
  type GeneratedManifest,
  type GeneratedShard,
} from '@/demo/local-fr-network';

const shards = import.meta.glob('./fixtures/fvd-sta3.generated/fvd_sta3-*.json', {
  import: 'default',
  eager: true,
}) as Record<string, GeneratedShard>;

export const FVD_STA3_METADATA = manifestJson.stations[0];

/** Same raw import and double-face pipeline as MF_LA_STA1/2; no station-specific processing. */
export function localFvdStationFixture() {
  return localFrNetworkFixtures(manifestJson as GeneratedManifest, shards)[0];
}
