import { describe, expect, it } from 'vitest';
import {
  hasNotableLines,
  highlightNativeText,
  nativeFileKind,
  NATIVE_PROJECT_BUSINESS_KEYS,
  type NativeTokenRole,
} from '@/domain/starnet/native-highlight';
import ukPreset from '@/configs/uk-supplied-hs2-nte.v1.json';
import type { StarNetAdjustmentConfig, StarNetWeights } from '@/domain/entities';
import { buildPrjPreview } from '@/domain/starnet/preview-builder';

const ukAdjustment = {
  ...ukPreset.adjustment,
  adjustmentType: '3D',
  linearUnits: 'Meters',
  angleOutputUnits: 'DMS',
  localOrGrid: 'local',
  coordinateOrder: 'EN',
  input3dMode: 'Slope/Zenith',
  defaultWeights: ukPreset.adjustment.defaultWeights as StarNetWeights,
} as StarNetAdjustmentConfig;

/** Role of the nth non-blank token of the given line. */
function roles(text: string, kind: 'dat' | 'prj' | 'listing'): NativeTokenRole[] {
  return highlightNativeText(text, kind)[0].tokens
    .filter((token) => token.text.trim().length > 0)
    .map((token) => token.role);
}

describe('native file kind', () => {
  it('recognises the three formats a run is made of', () => {
    expect(nativeFileKind('input.dat')).toBe('dat');
    expect(nativeFileKind('project.prj')).toBe('prj');
    expect(nativeFileKind('project.lst')).toBe('listing');
    expect(nativeFileKind('console-stdout.txt')).toBe('listing');
    expect(nativeFileKind('project.dmp')).toBe('text');
  });
});

describe('data file', () => {
  it('marks the datum decision of a coordinate record', () => {
    // The three trailing tokens are what a freed component changes, and what a wrong .dat hides.
    expect(roles('C  REF01_1  1215.4314  2158.8441  99.5756  *  0.0015  !', 'dat')).toEqual([
      'record', 'name', 'plain', 'plain', 'plain', 'free', 'sigma', 'fixed',
    ]);
  });

  it('marks the three standard errors of a measurement record', () => {
    expect(roles('DM  MP700  260-04-29.02  13.9355  96-15-37.31  0.5000  0.000614  0.5000  1.7214/0.0000', 'dat'))
      .toEqual(['record', 'name', 'plain', 'plain', 'plain', 'sigma', 'sigma', 'sigma', 'plain']);
  });

  it('leaves an unweighted measurement record alone', () => {
    expect(roles('DM  MP700  260-04-29.02  13.9355  96-15-37.31  1.7214/0.0000', 'dat'))
      .toEqual(['record', 'name', 'plain', 'plain', 'plain', 'plain']);
  });

  it('keeps a comment quiet and an option visible', () => {
    expect(roles('# Processing 2 — version v1', 'dat')).toEqual(['comment']);
    expect(roles('.EDM ADDITIVE', 'dat')).toEqual(['record', 'value']);
    expect(roles('DN  BTMORI001  0-00-00.00  !', 'dat')).toEqual(['record', 'name', 'plain', 'fixed']);
  });

  it('treats the coordinate records and the options as the lines that matter', () => {
    const lines = highlightNativeText(
      ['# comment', '.SCALE 0.99960001', 'C  REF01  1  2  3  !  !  !', 'DB  ST1', 'DE'].join('\n'),
      'dat',
    );
    expect(lines.filter((line) => line.notable).map((line) => line.number)).toEqual([2, 3]);
    expect(hasNotableLines(lines)).toBe(true);
  });
});

describe('project file', () => {
  it('highlights only the values BTM substitutes in the vendor template', () => {
    expect(roles('coordinate_order               EN', 'prj')).toEqual(['key', 'value']);
    expect(roles('some_vendor_option             7', 'prj')).toEqual(['plain', 'plain']);
    expect(roles('[DataFileList]', 'prj')).toEqual(['section']);
  });

  it('names every business key the generator actually replaces', () => {
    // A key that drifts out of this list would silently stop being highlighted.
    const prj = buildPrjPreview(ukAdjustment);
    for (const key of NATIVE_PROJECT_BUSINESS_KEYS) {
      expect(prj).toMatch(new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\S`, 'm'));
    }
  });
});

describe('listing', () => {
  const listing = [
    'STAR*NET-PRO Run Date: 2026-08-19',
    '==============================',
    'Solution Has Converged in 4 Iterations',
    'Chi-Square Test at 5.00% Level Passed',
    'Total Error Factor  0.874',
    'Warning: single ray point MP701',
    'MP103  Sd  -0.0043  *',
    'Adjusted Coordinates',
  ].join('\n');

  it('separates the verdict, the warnings and the plain text', () => {
    const lines = highlightNativeText(listing, 'listing');
    const roleOf = (needle: string) =>
      lines.find((line) => line.tokens[0].text.includes(needle))!.tokens[0].role;
    expect(roleOf('Converged')).toBe('pass');
    expect(roleOf('Chi-Square')).toBe('pass');
    expect(roleOf('Error Factor')).toBe('value');
    expect(roleOf('Warning')).toBe('warn');
    // STAR*NET flagged this residual itself; the wording says nothing.
    expect(roleOf('MP103')).toBe('warn');
    expect(roleOf('Adjusted Coordinates')).toBe('plain');
  });

  it('calls a failed test a failure even when the line also says "test"', () => {
    const lines = highlightNativeText('Chi-Square Test at 5.00% Level Failed', 'listing');
    expect(lines[0].tokens[0].role).toBe('fail');
  });

  it('keeps only the decisive lines when asked', () => {
    const lines = highlightNativeText(listing, 'listing');
    expect(hasNotableLines(lines)).toBe(true);
    expect(lines.filter((line) => line.notable)).toHaveLength(5);
  });
});
