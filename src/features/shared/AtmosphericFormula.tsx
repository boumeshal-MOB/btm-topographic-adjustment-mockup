import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Paper, Stack, Typography } from '@mui/material';
import type { AtmosphericPolicy } from '@/domain/entities';
import {
  STANDARD_PPM_COEFFICIENTS,
  STANDARD_PPM_FORMULA_ID,
  STANDARD_PPM_FORMULA_VERSION,
  atmosphericPpm,
} from '@/domain/corrections/atmosphere';
import { fixed } from '@/features/shared/format';

/**
 * The atmospheric correction, written as a formula rather than described in a sentence.
 *
 * Two decisions worth keeping:
 *
 * 1. **It states what is actually applied, not what the template declares.** `formulaId` is a label
 *    carried on the policy; `atmosphericPpm()` is what runs. The FR template declares
 *    `none-already-applied` while the code applies the standard ppm formula, so a station switched
 *    to cycle-T/P used to display a formula that was not the one weighing its distances. When the
 *    two disagree, the mismatch is shown instead of being resolved silently in favour of the label.
 *
 * 2. **It is typeset, not stringified.** A real fraction bar, a real minus sign, ×10⁻⁶ as an
 *    exponent. This is the one number on the screen a surveyor will check against a manufacturer
 *    sheet, and `281.8 - 0.29065 * P / (1 + T/273.15)` on one line is not what that sheet looks
 *    like. No external maths library: three formulas do not justify a font payload.
 */

/**
 * A fraction with a real rule between numerator and denominator.
 *
 * `inline-flex` in a column with a tight line height, so the rule sits on the equation's axis
 * instead of being pushed off it by a tall denominator — which is what a nested fraction does. The
 * nested one shrinks slightly for the same reason.
 */
function Fraction({ over, under, nested = false }: { over: ReactNode; under: ReactNode; nested?: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.25,
        fontSize: nested ? '0.92em' : undefined,
      }}
    >
      <Box component="span" sx={{ px: 0.6, pb: '2px' }}>{over}</Box>
      <Box
        component="span"
        sx={{ px: 0.6, pt: '2px', borderTop: '1px solid currentColor', width: '100%', textAlign: 'center' }}
      >
        {under}
      </Box>
    </Box>
  );
}

const MATHS_FONT = {
  fontFamily: '"Cambria Math", Cambria, "Times New Roman", serif',
  fontSize: '1.02rem',
} as const;

/**
 * A line containing a fraction. Flex with `center` is what puts the fraction on the equation's
 * axis — but it also makes every child a flex item, and a flex item's baseline shift is ignored,
 * so `<sub>`/`<sup>` inside one stop being sub and sup. Lines without a fraction therefore use
 * `MathsLine` below, which stays a normal inline context.
 */
function Maths({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ ...MATHS_FONT, lineHeight: 2.1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 0.4 }}>
      {children}
    </Box>
  );
}

/** A line of maths with no fraction, where sub/sup must keep their baseline offsets. */
function MathsLine({ children }: { children: ReactNode }) {
  return <Box sx={{ ...MATHS_FONT, lineHeight: 1.9 }}>{children}</Box>;
}

const V = ({ children }: { children: ReactNode }) => (
  <Box component="span" sx={{ fontStyle: 'italic' }}>{children}</Box>
);

const Sub = ({ children }: { children: ReactNode }) => (
  <Box component="sub" sx={{ fontSize: '0.7em' }}>{children}</Box>
);

/**
 * What each symbol stands for.
 *
 * The block used to state an equation and never say what was in it: a reader could not tell whether
 * `Sd` was the stored distance or the corrected one, nor that `Δ` is a *difference* of two constants
 * rather than the constant itself.
 */
function SymbolLegend({ rows }: { rows: [string, string][] }) {
  const { t } = useTranslation();
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={700} component="div">
        {t('wizard.instruments.formula.legendTitle')}
      </Typography>
      {rows.map(([symbol, meaning]) => (
        <Typography key={symbol} variant="caption" color="text.secondary" component="div" sx={{ pl: 0.5 }}>
          <Box component="span" sx={{ ...MATHS_FONT, fontStyle: 'italic', fontSize: '0.95rem', pr: 0.75 }}>
            {symbol}
          </Box>
          {meaning}
        </Typography>
      ))}
    </Box>
  );
}

/** Which formula the correction chain will really use for this policy. */
function appliedFormula(policy: AtmosphericPolicy): { id: string; version: number; computes: boolean } {
  const computes = policy.mode === 'cycle-temperature-pressure' || policy.mode === 'fixed-temperature-pressure';
  return computes
    ? { id: STANDARD_PPM_FORMULA_ID, version: STANDARD_PPM_FORMULA_VERSION, computes }
    : { id: 'none', version: 1, computes };
}

export function AtmosphericFormula({ policy }: { policy: AtmosphericPolicy }) {
  const { t } = useTranslation();
  const applied = appliedFormula(policy);

  /**
   * The values put through the formula. A fixed-T/P station has real configured numbers; a
   * cycle-T/P station resolves them per cycle, so the substitution is labelled a reference
   * atmosphere instead of pretending to be this station's measurement.
   */
  const usesConfigured = policy.mode === 'fixed-temperature-pressure'
    && policy.fixedTemperatureC !== undefined
    && policy.fixedPressureHPa !== undefined;
  const temperatureC = usesConfigured ? (policy.fixedTemperatureC as number) : 12;
  const pressureHPa = usesConfigured ? (policy.fixedPressureHPa as number) : 1013.25;
  const ppm = atmosphericPpm(temperatureC, pressureHPa);
  const scale = 1 + ppm * 1e-6;
  const overOneHundredMetresMm = ppm * 1e-6 * 100 * 1000;

  if (!applied.computes) {
    return (
      <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
        <Stack spacing={0.5}>
          <Typography variant="caption" fontWeight={700}>
            {t('wizard.instruments.formula.titleNone')}
          </Typography>
          <MathsLine>
            <V>Sd</V>
            <Sub>corr</Sub>
            {' = '}
            <V>Sd</V>
            {' + '}
            <V>Δ</V>
            <Sub>refl</Sub>
          </MathsLine>
          <Typography variant="caption" color="text.secondary">
            {t('wizard.instruments.formula.noneApplied')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {policy.mode === 'already-applied'
              ? t('wizard.instruments.formula.alreadyApplied')
              : t('wizard.instruments.formula.none')}
          </Typography>
          <SymbolLegend rows={[['Sd', t('wizard.instruments.formula.legendSd')], ['Δ', t('wizard.instruments.formula.legendDelta')]]} />
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
          <Typography variant="caption" fontWeight={700}>
            {t('wizard.instruments.formula.titleApplied')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {applied.id} v{applied.version}
          </Typography>
        </Stack>

        {/* One equation per line. Gluing the scale factor to the corrected distance with a middle
            dot read as a single, meaningless expression. */}
        <Maths>
          <V>ppm</V>
          <Box component="span">=</Box>
          <Box component="span">{STANDARD_PPM_COEFFICIENTS.refractivityPpm}</Box>
          <Box component="span">−</Box>
          <Fraction
            over={(
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', columnGap: 0.4 }}>
                <Box component="span">{STANDARD_PPM_COEFFICIENTS.pressurePerHPa}</Box>
                <Box component="span">·</Box>
                <V>P</V>
              </Box>
            )}
            under={(
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', columnGap: 0.4 }}>
                <Box component="span">1</Box>
                <Box component="span">+</Box>
                <Fraction
                  nested
                  over={<V>T</V>}
                  under={<Box component="span">{STANDARD_PPM_COEFFICIENTS.zeroCelsiusK}</Box>}
                />
              </Box>
            )}
          />
        </Maths>

        <MathsLine>
          <V>k</V>
          {' = 1 + '}
          <V>ppm</V>
          {' × 10'}
          <Box component="sup" sx={{ fontSize: '0.7em' }}>−6</Box>
        </MathsLine>

        <MathsLine>
          <V>Sd</V>
          <Sub>corr</Sub>
          {' = ('}
          <V>Sd</V>
          {' + '}
          <V>Δ</V>
          <Sub>refl</Sub>
          {') · '}
          <V>k</V>
        </MathsLine>

        <SymbolLegend
          rows={[
            ['Sd', t('wizard.instruments.formula.legendSd')],
            ['Δ', t('wizard.instruments.formula.legendDelta')],
            ['ppm', t('wizard.instruments.formula.legendPpm')],
            ['k', t('wizard.instruments.formula.legendK')],
          ]}
        />
        <Typography variant="caption" color="text.secondary">
          {t('wizard.instruments.formula.units')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('wizard.instruments.formula.order')}
        </Typography>

        <Box sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 0.75 }}>
          <Typography variant="caption" color="text.secondary" component="div">
            {usesConfigured
              ? t('wizard.instruments.formula.withFixed')
              : t('wizard.instruments.formula.withReference')}
            {': '}
            <V>T</V> = {fixed(temperatureC, 1)} °C, <V>P</V> = {fixed(pressureHPa, 2)} hPa{' → '}
            <b>{fixed(ppm, 2)} ppm</b>, <V>k</V> = {fixed(scale, 9)}
            {' — '}
            {t('wizard.instruments.formula.onSight', { millimetres: fixed(overOneHundredMetresMm, 3) })}
          </Typography>
        </Box>

        {policy.formulaId !== applied.id && (
          <Alert severity="warning" variant="outlined" sx={{ py: 0 }} data-testid="formula-mismatch">
            <Typography variant="caption">
              {t('wizard.instruments.formula.mismatch', {
                declared: policy.formulaId,
                declaredVersion: policy.formulaVersion,
                applied: applied.id,
              })}
            </Typography>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
