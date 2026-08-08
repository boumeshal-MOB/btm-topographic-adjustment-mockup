import { describe, expect, it } from 'vitest';
import {
  parseStarNetCoordinateFile,
  parseStarNetDumpFile,
  parseStarNetErrorFile,
  parseStarNetListing,
  parseStarNetNativeOutputs,
  parseStarNetRunStatus,
} from '@/domain/starnet/native-output-parser';

const listing = `
                         Adjustment Statistical Summary
                         ==============================

                        Iterations              =      2
                        Number of Stations      =     43
                        Number of Observations  =    155
                        Number of Unknowns      =    130
                        Number of Redundant Obs =     25

                  Total     155        24.837         0.997
                  The Chi-Square Test at 5.00% Level Passed
                       Lower/Upper Bounds (0.724/1.275)

                         Adjusted Coordinates (Meters)

Station                   E              N          Elev   Description
NTE_ATS34          280483.3574    288515.7716     31.5084
L34RE1100_329      280558.5569    288493.5571     30.7205

                      Adjusted Observations and Residuals

                    Adjusted Distance Observations (Meters)
           From       To              Distance      Residual   StdErr StdRes
           NTE_ATS34  L34RE1100_       78.4167        0.0003   0.0016   0.2

                       Adjusted Zenith Observations (DMS)
           From       To              Zenith        Residual   StdErr StdRes
           NTE_ATS34  L34RE1100_   90-34-33.52   -0-00-00.68     2.39   0.3

                     Adjusted Direction Observations (DMS)
           From       To            Direction       Residual   StdErr StdRes
           Set 1
           NTE_ATS34  L34RE1100_   72-24-10.65   -0-00-05.95     3.89   1.5

           Adjusted Bearings (DMS) and Horizontal Distances (Meters)

                Station Coordinate Standard Deviations (Meters)
Station                     E             N             Elev
NTE_ATS34                 0.000645      0.000579      0.000424
L34RE1100_329             0.001298      0.000882      0.000711

                   Station Coordinate Error Ellipses (Meters)
                            Confidence Region = 95%
Station                 Semi-Major    Semi-Minor   Azimuth of       Elev
NTE_ATS34                 0.001579      0.001416      93-10       0.000831
L34RE1100_329             0.003178      0.002159      88-50       0.001394

                        Relative Error Ellipses (Meters)
                           Elapsed Time = 00:00:00
`;

describe('native STAR*NET output parsing', () => {
  it('decodes the documented .run bitmask, including an incomplete STAR*NET 14 run', () => {
    const failed = parseStarNetRunStatus([
      '16641',
      '1 warnings detected',
      '256 errors detected',
      '16384 adjustment started but failed to complete',
    ].join('\r\n'))!;
    expect(failed.adjustmentCompleted).toBe(false);
    expect(failed.converged).toBe(false);
    expect(failed.flags.map((flag) => flag.bit)).toEqual([1, 256, 16384]);

    const warningOnly = parseStarNetRunStatus('1\r\n1 Run Warnings\r\n')!;
    expect(warningOnly.adjustmentCompleted).toBe(true);
    expect(warningOnly.converged).toBe(true);
  });

  it('parses listing statistics, coordinates, uncertainty, ellipses and residual units', () => {
    const parsed = parseStarNetListing(listing);
    expect(parsed).toMatchObject({
      completed: true,
      converged: true,
      iterations: 2,
      stationCount: 43,
      observationCount: 155,
      unknownCount: 130,
      degreesOfFreedom: 25,
      weightedSsr: 24.837,
      varianceFactor: 0.994009,
      totalErrorFactor: 0.997,
      chiSquareStatus: 'passed',
      totalErrorFactorLower: 0.724,
      totalErrorFactorUpper: 1.275,
      elapsed: '00:00:00',
    });
    expect(parsed.coordinates[1]).toMatchObject({
      engineName: 'L34RE1100_329',
      sigmaEM: 0.001298,
      sigmaNM: 0.000882,
      sigmaHM: 0.000711,
      ellipseSemiMajorM: 0.003178,
      ellipseSemiMinorM: 0.002159,
      ellipseAzimuthDeg: 88 + 50 / 60,
    });
    expect(parsed.residuals).toHaveLength(3);
    expect(parsed.residuals.find((row) => row.kind === 'distance')?.residual).toBe(0.0003);
    expect(parsed.residuals.find((row) => row.kind === 'zenith')?.residual).toBeCloseTo(-0.68, 10);
    expect(parsed.residuals.find((row) => row.kind === 'direction')?.residual).toBeCloseTo(-5.95, 10);
  });

  it('prefers full-precision .pts coordinates while enriching them from the listing', () => {
    const pts = [
      'NTE_ATS34       280483.35735 288515.77163   31.50836',
      'L34RE1100_329   280558.55690 288493.55714   30.72049',
    ].join('\r\n');
    const parsed = parseStarNetNativeOutputs([
      { extension: '.lst', content: listing },
      { extension: '.pts', content: pts },
      { extension: '.run', content: '0\r\n' },
    ]);
    expect(parsed.completed).toBe(true);
    expect(parsed.converged).toBe(true);
    expect(parsed.coordinates[1]).toMatchObject({
      engineName: 'L34RE1100_329',
      eastingM: 280558.5569,
      sigmaEM: 0.001298,
    });
  });

  it('supports NE coordinate output when the versioned config says NE', () => {
    expect(parseStarNetCoordinateFile('P1 200 100 5\r\n', 'NE')[0]).toEqual({
      engineName: 'P1',
      eastingM: 100,
      northingM: 200,
      heightM: 5,
    });
  });

  it('normalises GONS residuals and milligon standard errors to arcseconds', () => {
    const parsed = parseStarNetListing(`
Iterations = 1
Number of Stations = 2
Number of Observations = 3
Number of Unknowns = 1
Number of Redundant Obs = 2
Total 3 1.000 0.707
The Chi-Square Test at 5.00% Level Failed
Adjusted Coordinates (Meters)
Station E N Elev Description
P1 0 0 0
Adjusted Observations and Residuals
Adjusted Zenith Observations (GONS)
From To Zenith Residual StdErr StdRes
S1 P1 100.00000 -0.00010 0.5000 0.6
Adjusted Direction Observations (GONS)
From To Direction Residual StdErr StdRes
S1 P1 20.00000 0.00020 1.0000 0.6
Adjusted Bearings
`);
    expect(parsed.chiSquareStatus).toBe('failed');
    expect(parsed.residuals[0]).toMatchObject({ kind: 'zenith', residual: -0.324, standardError: 1.62 });
    expect(parsed.residuals[1]).toMatchObject({ kind: 'direction', residual: 0.648, standardError: 3.24 });
  });

  it('uses labelled full-precision DMP coordinates independently of project coordinate order', () => {
    const dump = [
      '"Name","Description","Northing","Easting","Elevation","StdDev Northing","StdDev Easting","StdDev Elevation"',
      '"P1","comma, safe",288515.771630001,280483.357350002,31.508360003,0.000579,0.000645,0.000424',
    ].join('\r\n');
    expect(parseStarNetDumpFile(dump)).toEqual([{
      engineName: 'P1',
      eastingM: 280483.357350002,
      northingM: 288515.771630001,
      heightM: 31.508360003,
      sigmaEM: 0.000645,
      sigmaNM: 0.000579,
      sigmaHM: 0.000424,
    }]);

    const parsed = parseStarNetNativeOutputs([
      { extension: '.dmp', content: dump },
      { extension: '.pts', content: 'P1 1 2 3\r\n' },
    ], '', 'NE');
    expect(parsed.coordinates[0].eastingM).toBe(280483.357350002);
  });

  it('separates warnings from fatal native errors', () => {
    expect(parseStarNetErrorFile(`
MicroSurvey STAR*NET-Ultimate Error Log
WARNING Network Has No Fixed XY Stations
Non-Determinant Solution - Check Network Design
Degrees of Freedom are Less than Zero : -4
Data line too long
Processing Terminated Due to Errors.
`)).toEqual({
      warnings: ['WARNING Network Has No Fixed XY Stations'],
      errors: [
        'Non-Determinant Solution - Check Network Design',
        'Degrees of Freedom are Less than Zero : -4',
        'Data line too long',
        'Processing Terminated Due to Errors.',
      ],
    });
  });

  it('rejects duplicate full coordinate names instead of silently overwriting a mapping', () => {
    expect(() => parseStarNetNativeOutputs([
      { extension: '.pts', content: 'P1 1 2 3\r\nP1 4 5 6\r\n' },
    ])).toThrow(/Duplicate STAR\*NET coordinate P1/);
  });
});
