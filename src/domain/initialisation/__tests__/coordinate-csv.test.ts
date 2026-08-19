import { describe, expect, it } from 'vitest';
import {
  coordinateCsvTemplate,
  parseCoordinateCsv,
} from '@/domain/initialisation/coordinate-csv';

describe('reference coordinates CSV', () => {
  it('reads a French export: semicolons and decimal commas, standard errors in millimetres', () => {
    const result = parseCoordinateCsv([
      'nom;E;N;H;sigmaE;sigmaN;sigmaH',
      'REF01;1215,4314;2158,8441;99,5756;1,5;1,5;2,0',
      'REF02;1231,2910;2146,8193;100,7795;1,5;1,5;2,0',
    ].join('\n'), 'references');

    expect(result.separator).toBe(';');
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ name: 'REF01', eastingM: 1215.4314, heightM: 99.5756 });
    // millimetres in the file, metres in the domain
    expect(result.rows[0].sigmaEM).toBeCloseTo(0.0015, 9);
    expect(result.rows[0].sigmaHM).toBeCloseTo(0.002, 9);
  });

  it('reads an English export: commas and decimal points', () => {
    const result = parseCoordinateCsv(
      'REF01,1215.4314,2158.8441,99.5756,1.5,1.5,2.0',
      'references',
    );
    expect(result.separator).toBe(',');
    expect(result.rows[0]).toMatchObject({ name: 'REF01', northingM: 2158.8441 });
  });

  it('refuses a known reference without its standard errors', () => {
    const result = parseCoordinateCsv('REF01;1215.4314;2158.8441;99.5756', 'references');
    expect(result.rows).toEqual([]);
    expect(result.errors[0].message).toMatch(/name;E;N;H;sigmaE/);
  });

  it('refuses a standard error of zero, which would claim a perfect coordinate', () => {
    const result = parseCoordinateCsv('REF01;1;2;3;1.5;0;2', 'references');
    expect(result.errors[0].message).toMatch(/greater than zero/);
  });

  it('reports the line of every bad row and keeps the good ones separate', () => {
    const result = parseCoordinateCsv([
      '# a comment is ignored',
      'REF01;1;2;3;1.5;1.5;2',
      'REF02;oops;2;3;1.5;1.5;2',
      'REF01;9;9;9;1;1;1',
    ].join('\n'), 'references');

    expect(result.rows.map((row) => row.name)).toEqual(['REF01']);
    expect(result.errors).toEqual([
      { line: 3, message: 'E, N and H must all be numbers in metres' },
      { line: 4, message: 'REF01 appears twice' },
    ]);
  });
});

describe('initial coordinates CSV', () => {
  it('reads approximations without any standard error', () => {
    const result = parseCoordinateCsv([
      'name;E;N;H',
      'MP103;1233.1471;2122.4965;101.0123',
    ].join('\n'), 'initial');
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toEqual({
      line: 2,
      name: 'MP103',
      eastingM: 1233.1471,
      northingM: 2122.4965,
      heightM: 101.0123,
    });
  });

  it('refuses a sigma column, which would suggest a control that does not exist', () => {
    const result = parseCoordinateCsv('MP103;1;2;3;1.5;1.5;2', 'initial');
    expect(result.rows).toEqual([]);
    expect(result.errors[0].message).toMatch(/carry no standard error/);
  });

  it('offers a template that its own parser accepts', () => {
    for (const kind of ['references', 'initial'] as const) {
      const parsed = parseCoordinateCsv(coordinateCsvTemplate(kind), kind);
      expect(parsed.errors).toEqual([]);
      expect(parsed.rows).toHaveLength(1);
    }
  });
});
