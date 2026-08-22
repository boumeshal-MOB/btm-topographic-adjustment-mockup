import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import type { CountryPresetSeed } from '@/domain/schemas/countryPreset.schema';
import { UnitField } from '@/features/shared/components';

export type TemplateListEntry = CountryPresetSeed & { isSystem: boolean; inUse: boolean };

/**
 * The country templates, as data the user owns.
 *
 * A template pre-fills a draft; it is not a national standard and it never changes a configuration
 * version that already exists. The two shipped templates stay read-only — they belong to the
 * repository, and freezing a copy in the database would stop a corrected file from ever reaching an
 * installation — so a project that needs its own values **duplicates** one. Duplicating rather than
 * starting blank is deliberate: a country template is a coherent set of decisions, and an empty one
 * would be a trap.
 */
export function CountryTemplatesPanel({ onError }: { onError: (message: string) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string>();
  const [editing, setEditing] = useState<TemplateListEntry>();
  const [duplicating, setDuplicating] = useState<TemplateListEntry>();
  const [label, setLabel] = useState('');

  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: () => api<TemplateListEntry[]>('GET', '/api/v2/templates'),
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['templates'] });
    void queryClient.invalidateQueries({ queryKey: ['drafts'] });
  };

  const create = useMutation({
    mutationFn: (body: { sourceId: string; label: string }) =>
      api<CountryPresetSeed>('POST', '/api/v2/templates', body),
    onSuccess: () => { setDuplicating(undefined); setLabel(''); invalidate(); },
    onError: (error) => onError(String(error)),
  });
  const update = useMutation({
    mutationFn: (args: { id: string; patch: Partial<CountryPresetSeed> }) =>
      api<CountryPresetSeed>('PUT', `/api/v2/templates/${args.id}`, args.patch),
    onSuccess: () => { setEditing(undefined); invalidate(); },
    onError: (error) => onError(String(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>('DELETE', `/api/v2/templates/${id}`),
    onSuccess: invalidate,
    onError: (error) => onError(String(error)),
  });

  const rows = templates.data ?? [];

  return (
    <Stack spacing={1.25}>
      <Typography variant="body2" color="text.secondary">{t('templates.description')}</Typography>

      <Table size="small" aria-label={t('templates.title')}>
        <TableHead>
          <TableRow>
            <TableCell>{t('templates.label')}</TableCell>
            <TableCell>{t('templates.country')}</TableCell>
            <TableCell>{t('templates.origin')}</TableCell>
            <TableCell align="right">{t('home.actions')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((template) => (
            <TableRow key={template.id} hover>
              <TableCell>
                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="body2" fontWeight={600}>{template.label}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    {template.id} · v{template.version}
                  </Typography>
                  {template.inUse && <Chip size="small" variant="outlined" label={t('templates.inUse')} />}
                </Stack>
              </TableCell>
              <TableCell>{template.country}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  variant="outlined"
                  color={template.isSystem ? 'default' : 'primary'}
                  label={t(template.isSystem ? 'templates.system' : 'templates.user')}
                />
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                  <Button
                    size="small"
                    onClick={() => setExpanded(expanded === template.id ? undefined : template.id)}
                    data-testid={`view-template-${template.id}`}
                  >
                    {t(expanded === template.id ? 'templates.hideValues' : 'templates.showValues')}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => { setDuplicating(template); setLabel(`${template.label} — copy`); }}
                    data-testid={`duplicate-template-${template.id}`}
                  >
                    {t('templates.duplicate')}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={template.isSystem}
                    onClick={() => setEditing(template)}
                    data-testid={`edit-template-${template.id}`}
                  >
                    {t('templates.edit')}
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    disabled={template.isSystem || template.inUse || remove.isPending}
                    onClick={() => remove.mutate(template.id)}
                  >
                    {t('templates.delete')}
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
          {rows.map((template) => (
            <TableRow key={`${template.id}-values`}>
              <TableCell colSpan={4} sx={{ p: 0, border: 0 }}>
                <Collapse in={expanded === template.id} unmountOnExit>
                  <Box sx={{ p: 1.5, bgcolor: 'action.hover' }} data-testid={`template-values-${template.id}`}>
                    <TemplateValues template={template} />
                  </Box>
                </Collapse>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {rows.every((template) => template.isSystem) && (
        <Alert severity="info" variant="outlined" sx={{ py: 0 }}>
          <Typography variant="caption">{t('templates.systemOnlyHint')}</Typography>
        </Alert>
      )}

      <Dialog open={duplicating !== undefined} onClose={() => setDuplicating(undefined)} fullWidth maxWidth="sm">
        <DialogTitle>{t('templates.duplicateTitle', { label: duplicating?.label ?? '' })}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <TextField
              label={t('templates.label')}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              inputProps={{ 'data-testid': 'new-template-label' }}
              fullWidth
            />
            <Typography variant="caption" color="text.secondary">{t('templates.duplicateHint')}</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicating(undefined)}>{t('templates.cancel')}</Button>
          <Button
            variant="contained"
            disabled={!label.trim() || create.isPending}
            onClick={() => duplicating && create.mutate({ sourceId: duplicating.id, label })}
            data-testid="confirm-duplicate-template"
          >
            {t('templates.duplicate')}
          </Button>
        </DialogActions>
      </Dialog>

      {editing && (
        <TemplateEditor
          template={editing}
          saving={update.isPending}
          onCancel={() => setEditing(undefined)}
          onSave={(patch) => update.mutate({ id: editing.id, patch })}
        />
      )}
    </Stack>
  );
}

/** Every value the template states, read-only — including the ones this screen does not edit. */
function TemplateValues({ template }: { template: TemplateListEntry }) {
  const { t } = useTranslation();
  const adjustment = template.adjustment;
  const rows: [string, string][] = [
    [t('templates.field.units'), `${adjustment.adjustmentType} · ${adjustment.linearUnits} · ${adjustment.coordinateOrder} · ${adjustment.angleOutputUnits}`],
    [t('templates.field.scaleFactor'), String(adjustment.scaleFactor)],
    [t('templates.field.refraction'), `${adjustment.indexOfRefraction} · ${adjustment.earthRadiusM} m`],
    [t('templates.field.convergence'), `${adjustment.convergeLimit} · ${adjustment.maximumIterations} it.`],
    [t('templates.field.quality'), `χ² ${adjustment.chiSquareSignificancePercent} % · ${t('templates.field.ellipse')} ${adjustment.ellipseConfidencePercent} %`],
    [t('templates.field.atmosphere'), `${template.atmosphericPolicy.mode} · ${template.atmosphericPolicy.missingPolicy} · ${template.atmosphericPolicy.formulaId}`],
    [t('templates.field.reflectors'), template.measurementSetups.map((setup) => setup.label).join(' · ')],
  ];
  return (
    <Stack spacing={1}>
      <Table size="small">
        <TableBody>
          {rows.map(([name, value]) => (
            <TableRow key={name}>
              <TableCell sx={{ width: 220, border: 0, py: 0.25 }}>
                <Typography variant="caption" color="text.secondary">{name}</Typography>
              </TableCell>
              <TableCell sx={{ border: 0, py: 0.25 }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{value}</Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="caption" fontWeight={700}>{t('templates.field.instruments')}</Typography>
      <Table size="small">
        <TableBody>
          {template.instrumentTemplates.map((instrument) => (
            <TableRow key={instrument.id}>
              <TableCell sx={{ width: 220, border: 0, py: 0.25 }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                  {instrument.manufacturer} {instrument.model}
                </Typography>
              </TableCell>
              <TableCell sx={{ border: 0, py: 0.25 }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                  {instrument.angleAccuracyArcSec ?? '—'}″ ·{' '}
                  {Object.entries(instrument.measurementFamilies ?? {})
                    .map(([family, precision]) => `${family} ${precision.distanceStdErrMm} mm + ${precision.distancePpm} ppm`)
                    .join(' · ') || t('templates.field.noFamilyPrecision')}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary">
        {t('templates.provenance')}: {template.provenance.join(' · ')}
      </Typography>
    </Stack>
  );
}

/**
 * The values a project genuinely retunes: the STAR*NET parameters, the atmospheric defaults and the
 * instrument's declared precision. Reflector setups stay read-only here — they are structural, and
 * editing a constant that a sight already resolved belongs to the sight, not to the template.
 */
function TemplateEditor({
  template,
  saving,
  onCancel,
  onSave,
}: {
  template: TemplateListEntry;
  saving: boolean;
  onCancel: () => void;
  onSave: (patch: Partial<CountryPresetSeed>) => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(template.label);
  const [adjustment, setAdjustment] = useState(template.adjustment);
  const [atmosphere, setAtmosphere] = useState(template.atmosphericPolicy);
  const [instrument, setInstrument] = useState(template.instrumentTemplates[0]);
  const patchAdjustment = (patch: Partial<typeof adjustment>) => setAdjustment((current) => ({ ...current, ...patch }));

  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="md">
      <DialogTitle>{t('templates.editTitle', { label: template.label })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('templates.label')} value={label} onChange={(event) => setLabel(event.target.value)} fullWidth />

          <Typography variant="caption" fontWeight={700}>{t('templates.field.starnet')}</Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel id="angle-units">{t('templates.field.angleUnits')}</InputLabel>
              <Select
                labelId="angle-units"
                label={t('templates.field.angleUnits')}
                value={adjustment.angleOutputUnits}
                onChange={(event) => patchAdjustment({ angleOutputUnits: event.target.value as typeof adjustment.angleOutputUnits })}
              >
                <MenuItem value="DMS">DMS</MenuItem>
                <MenuItem value="Gons">Gons</MenuItem>
              </Select>
            </FormControl>
            <UnitField label={t('templates.field.scaleFactor')} unit="" value={adjustment.scaleFactor} onChange={(value) => patchAdjustment({ scaleFactor: value })} step={0.00000001} width={190} />
            <UnitField label={t('templates.field.refractionShort')} unit="" value={adjustment.indexOfRefraction} onChange={(value) => patchAdjustment({ indexOfRefraction: value })} step={0.01} width={170} />
            <UnitField label={t('templates.field.earthRadius')} unit="m" value={adjustment.earthRadiusM} onChange={(value) => patchAdjustment({ earthRadiusM: value })} step={1000} width={190} />
            <UnitField label={t('templates.field.convergeLimit')} unit="" value={adjustment.convergeLimit} onChange={(value) => patchAdjustment({ convergeLimit: value })} step={0.001} width={170} />
            <UnitField label={t('templates.field.maxIterations')} unit="" value={adjustment.maximumIterations} onChange={(value) => patchAdjustment({ maximumIterations: value })} step={1} width={170} />
            <UnitField label={t('templates.field.chiSquare')} unit="%" value={adjustment.chiSquareSignificancePercent} onChange={(value) => patchAdjustment({ chiSquareSignificancePercent: value })} step={1} width={170} />
            <UnitField label={t('templates.field.ellipse')} unit="%" value={adjustment.ellipseConfidencePercent} onChange={(value) => patchAdjustment({ ellipseConfidencePercent: value })} step={1} width={170} />
          </Stack>

          <Typography variant="caption" fontWeight={700}>{t('templates.field.atmosphere')}</Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <FormControl size="small" sx={{ minWidth: 300 }}>
              <InputLabel id="atmo-mode">{t('wizard.instruments.atmospheric')}</InputLabel>
              <Select
                labelId="atmo-mode"
                label={t('wizard.instruments.atmospheric')}
                value={atmosphere.mode}
                onChange={(event) => setAtmosphere({ ...atmosphere, mode: event.target.value as typeof atmosphere.mode })}
              >
                <MenuItem value="already-applied">{t('wizard.instruments.atmoApplied')}</MenuItem>
                <MenuItem value="cycle-temperature-pressure">{t('wizard.instruments.atmoCycle')}</MenuItem>
                <MenuItem value="fixed-temperature-pressure">{t('wizard.instruments.atmoFixed')}</MenuItem>
                <MenuItem value="none">{t('wizard.instruments.atmoNone')}</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 280 }}>
              <InputLabel id="atmo-missing">{t('wizard.instruments.missingPolicy')}</InputLabel>
              <Select
                labelId="atmo-missing"
                label={t('wizard.instruments.missingPolicy')}
                value={atmosphere.missingPolicy}
                onChange={(event) => setAtmosphere({ ...atmosphere, missingPolicy: event.target.value as typeof atmosphere.missingPolicy })}
              >
                <MenuItem value="wait-or-fail">{t('wizard.instruments.missingWait')}</MenuItem>
                <MenuItem value="fixed-fallback">{t('wizard.instruments.missingFallback')}</MenuItem>
                <MenuItem value="continue-without-correction">{t('wizard.instruments.missingContinue')}</MenuItem>
                <MenuItem value="assume-already-corrected">{t('wizard.instruments.missingAssume')}</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          {instrument && (
            <>
              <Typography variant="caption" fontWeight={700}>
                {t('templates.field.instruments')} — {instrument.manufacturer} {instrument.model}
              </Typography>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <UnitField
                  label={t('templates.field.angleAccuracy')}
                  unit="″"
                  value={instrument.angleAccuracyArcSec ?? 1}
                  onChange={(value) => setInstrument({ ...instrument, angleAccuracyArcSec: value })}
                  step={0.1}
                  width={190}
                />
                {Object.entries(instrument.measurementFamilies ?? {}).map(([family, precision]) => (
                  <UnitField
                    key={family}
                    label={`σ ${family}`}
                    unit="mm"
                    value={precision.distanceStdErrMm}
                    onChange={(value) => setInstrument({
                      ...instrument,
                      measurementFamilies: {
                        ...instrument.measurementFamilies,
                        [family]: { ...precision, distanceStdErrMm: value },
                      },
                    })}
                    step={0.1}
                    width={170}
                  />
                ))}
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t('templates.cancel')}</Button>
        <Button
          variant="contained"
          disabled={!label.trim() || saving}
          data-testid="save-template"
          onClick={() => onSave({
            label,
            adjustment,
            atmosphericPolicy: atmosphere,
            ...(instrument
              ? { instrumentTemplates: [instrument, ...template.instrumentTemplates.slice(1)] }
              : {}),
          })}
        >
          {t('templates.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
