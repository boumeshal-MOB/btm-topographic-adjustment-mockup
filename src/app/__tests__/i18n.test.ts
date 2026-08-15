import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en/topographicAdjustment.json';
import fr from '@/i18n/locales/fr/topographicAdjustment.json';
import { VALIDATION_SCENARIOS } from '@/domain/validation-catalogue/schema';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') flat.set(path, value);
    else for (const [nested, text] of flatten(value, path)) flat.set(nested, text);
  }
  return flat;
}

const english = flatten(en as Tree);
const french = flatten(fr as Tree);

describe('translations', () => {
  it('defines exactly the same keys in both languages', () => {
    expect([...french.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('never leaves a translation empty', () => {
    for (const [key, value] of [...english, ...french]) {
      expect(value.trim(), `${key} is empty`).not.toBe('');
    }
  });

  it('keeps the same interpolation placeholders in both languages', () => {
    const placeholders = (value: string) => (value.match(/\{\{\w+\}\}/g) ?? []).sort();
    for (const [key, value] of english) {
      expect(placeholders(french.get(key)!), `${key} placeholders`).toEqual(placeholders(value));
    }
  });

  it('labels every scenario family the catalogue can contain', () => {
    for (const scenario of VALIDATION_SCENARIOS) {
      expect(english.has(`validation.scenarios.${scenario}`), scenario).toBe(true);
      expect(french.has(`validation.scenarios.${scenario}`), scenario).toBe(true);
    }
    // plus the blind-mode placeholder the sealed dataset reports
    expect(english.has('validation.scenarios.undisclosed')).toBe(true);
  });

  it('translates rather than copying the English text', () => {
    // A few load-bearing strings that must genuinely differ, to catch a locale file that was
    // duplicated instead of translated.
    for (const key of ['app.title', 'validation.title', 'analysis.subtitle', 'validation.filters.reset']) {
      expect(french.get(key), key).not.toBe(english.get(key));
    }
  });
});
