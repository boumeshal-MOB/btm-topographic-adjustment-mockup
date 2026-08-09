import { describe, expect, it } from 'vitest';
import { createAppTheme } from '@/app/theme';
import en from '@/i18n/locales/en/topographicAdjustment.json';
import fr from '@/i18n/locales/fr/topographicAdjustment.json';

function leafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe('topographic-adjustment translation catalogues', () => {
  it('keeps French and English translation keys in parity', () => {
    expect(leafKeys(fr).sort()).toEqual(leafKeys(en).sort());
  });

  it('uses accepted French surveying terminology for the core workflow', () => {
    expect(fr.app.title).toBe('Compensation topographique');
    expect(fr.wizard.steps.initialisation).toBe('Coordonnées approchées');
    expect(fr.enums.role.reference).toBe('Point de contrôle');
    expect(fr.analysis.observations.sdHelp).toBe('distance inclinée');
    expect(fr.targets.edm['precise-prism']).toBe('Précis · prisme');
    expect(fr.analysis.observations.sigmaSd).toBe('σ Di (mm)');
    expect(fr.analysis.diagnostic.variance).toBe('Facteur de variance');
  });

  it('applies the French MUI locale to native component labels', () => {
    const defaultProps = createAppTheme('fr').components?.MuiTablePagination?.defaultProps;
    expect(defaultProps?.labelRowsPerPage).toBe('Lignes par page :');
    expect(defaultProps?.getItemAriaLabel?.('next')).toContain('page suivante');
  });
});
