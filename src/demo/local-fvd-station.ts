import sta1ManifestJson from '@/demo/fixtures/fvd-sta1.generated/manifest.json';
import sta3ManifestJson from '@/demo/fixtures/fvd-sta3.generated/manifest.json';
import {
  localFrNetworkFixtures,
  type GeneratedManifest,
  type GeneratedShard,
} from '@/demo/local-fr-network';

const sta1Shards = import.meta.glob('./fixtures/fvd-sta1.generated/fvd_sta1-*.json', {
  import: 'default',
  eager: true,
}) as Record<string, GeneratedShard>;

const sta3Shards = import.meta.glob('./fixtures/fvd-sta3.generated/fvd_sta3-*.json', {
  import: 'default',
  eager: true,
}) as Record<string, GeneratedShard>;

export const FVD_STA1_METADATA = sta1ManifestJson.stations[0];
export const FVD_STA3_METADATA = sta3ManifestJson.stations[0];

/** FVD_STA3 stays first so every pre-existing generated catalogue identity remains stable. */
export function localFvdStationFixtures() {
  return [
    localFrNetworkFixtures(sta3ManifestJson as GeneratedManifest, sta3Shards)[0],
    localFrNetworkFixtures(sta1ManifestJson as GeneratedManifest, sta1Shards)[0],
  ];
}

/** Same raw import and double-face pipeline as MF_LA_STA1/2; no station-specific processing. */
export function localFvdStationFixture() {
  return localFvdStationFixtures()[0];
}
