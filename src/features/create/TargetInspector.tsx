import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { DraftTargetConfig } from '@/demo/draft';
import type { ConstraintMode, DistanceKind, TargetRole } from '@/domain/entities';
import {
  CUSTOM_REFLECTOR_ID,
  reflectorPatch,
  type ReflectorOption,
} from '@/domain/instruments/reflector-catalogue';
import { COMPONENTS, componentConstraint, type Component } from '@/features/create/datum-view-model';
import type { TargetTableRow } from '@/features/create/target-table-view-model';

/**
 * One sight, in full — the place where anything about it can be changed.
 *
 * The table states, the inspector edits. That split is what lets the table stay dense enough to read
 * a station of a hundred prisms, and it is the same split the Analysis Lab already uses between its
 * point table and its inspector.
 *
 * A standard error shown here is the *resolved* one, with the step of the chain that produced it: an
 * empty field means "follow the instrument", and the placeholder is the value that will be used. So
 * clearing a field is a real act — it hands the number back to the station — instead of leaving a
 * blank the run has to guess about.
 */
export function TargetInspector({
  row,
  reflectors,
  onPatch,
  onConstraint,
  onSigma,
  onClose,
}: {
  row: TargetTableRow;
  reflectors: readonly ReflectorOption[];
  onPatch: (patch: Partial<DraftTargetConfig>) => void;
  onConstraint: (component: Component, mode: ConstraintMode) => void;
  onSigma: (component: Component, sigmaMm: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { target, precision, catalogue } = row;
  const optional = (value: number | undefined) => (value === undefined ? '' : String(value));
  const toNumber = (value: string) => (value.trim() === '' ? undefined : Number(value));
  const followsInstrument = precision.distanceStdErrMm.source !== 'sight'
    && precision.distancePpm.source !== 'sight'
    && precision.directionArcSec.source !== 'sight'
    && precision.zenithArcSec.source !== 'sight'
    && precision.distanceKind.source !== 'sight';

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, borderRadius: 2, position: 'sticky', top: 8 }}
      data-testid="target-inspector"
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={800} fontFamily="monospace" noWrap>
              {target.rawTargetName}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {target.stationCode} · {catalogue ? t('wizard.targets.sensor', { id: catalogue.prismSensorId }) : t('wizard.targets.sensorLoading')}
            </Typography>
          </Stack>
          <IconButton size="small" onClick={onClose} aria-label={t('wizard.targets.closeInspector')}>
            <Box component="span" aria-hidden sx={{ fontSize: 15, lineHeight: 1 }}>×</Box>
          </IconButton>
        </Stack>

        <Stack direction="row" spacing={0.5}>
          <FormControlLabel
            control={(
              <Checkbox
                size="small"
                checked={target.includeInAdjustment}
                onChange={(event) => onPatch({ includeInAdjustment: event.target.checked })}
              />
            )}
            label={<Typography variant="caption">{t('wizard.targets.adjust')}</Typography>}
            sx={{ m: 0 }}
          />
          <FormControlLabel
            control={(
              <Checkbox
                size="small"
                color="success"
                checked={target.publishOutput}
                onChange={(event) => onPatch({ publishOutput: event.target.checked })}
              />
            )}
            label={<Typography variant="caption">{t('wizard.targets.publish')}</Typography>}
            sx={{ m: 0 }}
          />
        </Stack>

        <Stack direction="row" spacing={1}>
          <FormControl size="small" fullWidth>
            <InputLabel id="inspector-role">{t('wizard.targets.role')}</InputLabel>
            <Select
              labelId="inspector-role"
              label={t('wizard.targets.role')}
              value={target.role}
              onChange={(event) => onPatch({ role: event.target.value as TargetRole })}
            >
              <MenuItem value="reference">{t('enums.role.reference')}</MenuItem>
              <MenuItem value="monitoring">{t('enums.role.monitoring')}</MenuItem>
              <MenuItem value="auxiliary">{t('enums.role.auxiliary')}</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label={t('wizard.targets.engineName')}
            value={target.engineName}
            onChange={(event) => onPatch({ engineName: event.target.value })}
            sx={{ width: 150 }}
          />
        </Stack>

        <Divider textAlign="left">
          <Typography variant="caption" color="text.secondary">{t('wizard.targets.columnReflector')}</Typography>
        </Divider>

        <FormControl size="small" fullWidth>
          <InputLabel id="inspector-reflector">{t('wizard.targets.reflector')}</InputLabel>
          <Select
            labelId="inspector-reflector"
            label={t('wizard.targets.reflector')}
            value={row.reflectorId}
            onChange={(event) => {
              const chosen = reflectors.find((option) => option.id === event.target.value);
              // `custom` is not a reflector: it keeps the numbers already there and hands them over
              // to be typed. Dropping the setup id is what makes the row say "custom" from then on.
              if (!chosen) onPatch({ measurementSetupId: undefined });
              else onPatch(reflectorPatch(chosen));
            }}
            data-testid="inspector-reflector"
          >
            {reflectors.map((option) => (
              <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>
            ))}
            <MenuItem value={CUSTOM_REFLECTOR_ID}>{t('wizard.targets.customReflector')}</MenuItem>
          </Select>
        </FormControl>

        {target.measurementType === 'reflectorless' ? (
          <Typography variant="caption" color="text.secondary">{t('wizard.targets.noConstant')}</Typography>
        ) : (
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              type="number"
              label={t('wizard.targets.constantRequired')}
              value={Number((target.requiredConstantM * 1000).toFixed(2))}
              onChange={(event) => onPatch({ requiredConstantM: Number(event.target.value) / 1000, measurementSetupId: undefined })}
              inputProps={{ step: 0.1 }}
              sx={{ width: 120 }}
            />
            <TextField
              size="small"
              type="number"
              label={t('wizard.targets.constantApplied')}
              value={Number((target.alreadyAppliedConstantM * 1000).toFixed(2))}
              onChange={(event) => onPatch({ alreadyAppliedConstantM: Number(event.target.value) / 1000, measurementSetupId: undefined })}
              inputProps={{ step: 0.1 }}
              sx={{ width: 120 }}
            />
            <Chip
              size="small"
              color={row.constant.kind === 'btm' ? 'warning' : 'success'}
              variant={row.constant.kind === 'btm' ? 'filled' : 'outlined'}
              label={row.constant.kind === 'btm'
                ? `BTM ${row.constant.deltaMm > 0 ? '+' : ''}${row.constant.deltaMm.toFixed(1)}`
                : t(`wizard.targets.constantState.${row.constant.kind}`)}
            />
          </Stack>
        )}

        <TextField
          size="small"
          type="number"
          label={t('wizard.targets.targetHeight')}
          value={Number(target.targetHeightM.toFixed(4))}
          onChange={(event) => onPatch({ targetHeightM: Number(event.target.value) })}
          inputProps={{ step: 0.001 }}
          sx={{ width: 150 }}
        />

        <Divider textAlign="left">
          <Typography variant="caption" color="text.secondary">{t('wizard.precision.title')}</Typography>
        </Divider>

        <Stack direction="row" spacing={0.75} alignItems="center">
          <Chip
            size="small"
            variant="outlined"
            color={followsInstrument ? 'default' : 'secondary'}
            label={t(followsInstrument ? 'wizard.targets.precisionFromInstrument' : 'wizard.targets.precisionFromSight')}
          />
          {followsInstrument && (
            <Typography variant="caption" color="text.secondary">
              {t('wizard.targets.emptyFollowsInstrument')}
            </Typography>
          )}
          {!followsInstrument && (
            <Button
              size="small"
              onClick={() => onPatch({
                distanceStdErrMm: undefined,
                distancePpm: undefined,
                directionStdErrArcSec: undefined,
                zenithStdErrArcSec: undefined,
                distanceKind: undefined,
              })}
              data-testid="inspector-follow-instrument"
            >
              {t('wizard.targets.followInstrument')}
            </Button>
          )}
        </Stack>

        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            type="number"
            label={t('wizard.precision.sigmaDistance')}
            value={optional(target.distanceStdErrMm)}
            placeholder={precision.distanceStdErrMm.value.toFixed(2)}
            onChange={(event) => onPatch({ distanceStdErrMm: toNumber(event.target.value) })}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: 0.05, min: 0 }}
          />
          <TextField
            size="small"
            type="number"
            label={t('wizard.precision.ppm')}
            value={optional(target.distancePpm)}
            placeholder={precision.distancePpm.value.toFixed(1)}
            onChange={(event) => onPatch({ distancePpm: toNumber(event.target.value) })}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: 0.1, min: 0 }}
          />
        </Stack>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            type="number"
            label={t('wizard.precision.sigmaHz')}
            value={optional(target.directionStdErrArcSec)}
            placeholder={precision.directionArcSec.value.toFixed(2)}
            onChange={(event) => onPatch({ directionStdErrArcSec: toNumber(event.target.value) })}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: 0.05, min: 0 }}
          />
          <TextField
            size="small"
            type="number"
            label={t('wizard.precision.sigmaVz')}
            value={optional(target.zenithStdErrArcSec)}
            placeholder={precision.zenithArcSec.value.toFixed(2)}
            onChange={(event) => onPatch({ zenithStdErrArcSec: toNumber(event.target.value) })}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: 0.05, min: 0 }}
          />
        </Stack>
        <FormControl size="small" fullWidth>
          <InputLabel id="inspector-distance-kind">{t('wizard.precision.distanceKind')}</InputLabel>
          <Select
            labelId="inspector-distance-kind"
            label={t('wizard.precision.distanceKind')}
            value={target.distanceKind ?? ''}
            displayEmpty
            onChange={(event) => onPatch({ distanceKind: event.target.value === '' ? undefined : event.target.value as DistanceKind })}
          >
            <MenuItem value="">
              {t('wizard.targets.inheritInstrument', { value: t(`enums.distanceKind.${precision.distanceKind.value}`) })}
            </MenuItem>
            <MenuItem value="slope">{t('enums.distanceKind.slope')}</MenuItem>
            <MenuItem value="horizontal">{t('enums.distanceKind.horizontal')}</MenuItem>
          </Select>
        </FormControl>

        <Divider textAlign="left">
          <Typography variant="caption" color="text.secondary">{t('wizard.targets.columnControl')}</Typography>
        </Divider>

        {target.role !== 'reference' && (
          <Alert severity="info" variant="outlined" sx={{ py: 0 }}>
            <Typography variant="caption">{t('wizard.targets.constraintNonReference')}</Typography>
          </Alert>
        )}
        {row.control && !row.coordinateKnown && (
          <Alert severity="warning" variant="outlined" sx={{ py: 0 }} data-testid="inspector-approximate-coordinate">
            <Typography variant="caption">{t('wizard.targets.coordinateApproximate')}</Typography>
          </Alert>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr 108px', columnGap: 0.75, rowGap: 0.75, alignItems: 'center' }}>
          {COMPONENTS.map((component) => {
            const { mode, sigmaMm } = componentConstraint(row.control, component);
            return (
              <Box key={component} sx={{ display: 'contents' }}>
                <Typography variant="caption" fontWeight={800}>{component}</Typography>
                <FormControl size="small">
                  <Select
                    value={mode}
                    onChange={(event) => onConstraint(component, event.target.value as ConstraintMode)}
                    inputProps={{ 'aria-label': `${t('wizard.targets.columnControl')} ${component} ${target.engineName}` }}
                  >
                    <MenuItem value="fixed">{t('enums.constraint.fixed')}</MenuItem>
                    <MenuItem value="weak">{t('enums.constraint.weak')}</MenuItem>
                    <MenuItem value="free">{t('enums.constraint.free')}</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  type="number"
                  label={t('wizard.targets.constraintSigma')}
                  value={Number(sigmaMm.toFixed(2))}
                  disabled={mode !== 'weak'}
                  onChange={(event) => onSigma(component, Number(event.target.value))}
                  inputProps={{ step: 0.1, min: 0 }}
                />
              </Box>
            );
          })}
        </Box>

        {catalogue && (
          <Typography variant="caption" color="text.secondary" fontFamily="monospace">
            Hz {catalogue.hzVariableId} · Vz {catalogue.vzVariableId} · Sd {catalogue.sdVariableId}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
