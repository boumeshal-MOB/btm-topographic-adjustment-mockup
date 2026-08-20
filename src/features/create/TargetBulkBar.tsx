import { useState, type HTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Popover,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { ConstraintMode, DistanceKind, TargetRole } from '@/domain/entities';
import type { ReflectorOption } from '@/domain/instruments/reflector-catalogue';
import { bulkEditIsEmpty, type TargetBulkEdit } from '@/features/create/target-table-view-model';

/** The bulk form's "leave this field alone" value. Never written to a draft. */
const UNCHANGED = '';

/**
 * A test id on the element a click has to hit.
 *
 * MUI puts extra props on the Select *root*, while the thing that opens the menu is the display div
 * reached through `SelectDisplayProps` — and that prop is typed as plain HTML attributes, which
 * excludes `data-*`. The assertion is the narrowest way to say "this really is a DOM attribute".
 */
const displayTestId = (id: string) => ({ 'data-testid': id }) as HTMLAttributes<HTMLDivElement>;

export interface BulkConstraint {
  mode: ConstraintMode;
  sigmaMm?: number;
}

/**
 * What makes a hundred prisms per station workable: one gesture that writes many rows.
 *
 * Two rules keep it honest. A field left empty is **not** applied — the bar never invents a value to
 * fill a blank — and the row count it will write is on the button, so the size of the gesture is
 * visible before it happens. Adjust and publish stay outside the form because they are the two
 * changes a surveyor makes constantly, and a popover for them would be a click too many.
 */
export function TargetBulkBar({
  count,
  reflectors,
  onApply,
  onQuickToggle,
  onConstraint,
  onClear,
}: {
  count: number;
  reflectors: readonly ReflectorOption[];
  onApply: (edit: TargetBulkEdit) => void;
  onQuickToggle: (patch: { includeInAdjustment?: boolean; publishOutput?: boolean }) => void;
  onConstraint: (constraint: BulkConstraint) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [role, setRole] = useState<TargetRole | ''>(UNCHANGED);
  const [reflectorId, setReflectorId] = useState<string>(UNCHANGED);
  const [heightM, setHeightM] = useState('');
  const [distanceMm, setDistanceMm] = useState('');
  const [ppm, setPpm] = useState('');
  const [hz, setHz] = useState('');
  const [vz, setVz] = useState('');
  const [distanceKind, setDistanceKind] = useState<DistanceKind | ''>(UNCHANGED);
  const [followInstrument, setFollowInstrument] = useState(false);
  const [constraintMode, setConstraintMode] = useState<ConstraintMode | ''>(UNCHANGED);
  const [constraintSigmaMm, setConstraintSigmaMm] = useState('1.5');

  const number = (value: string) => (value.trim() === '' ? undefined : Number(value));

  const edit: TargetBulkEdit = {
    role: role === UNCHANGED ? undefined : role,
    reflectorId: reflectorId === UNCHANGED ? undefined : reflectorId,
    targetHeightM: number(heightM),
    distanceStdErrMm: number(distanceMm),
    distancePpm: number(ppm),
    directionStdErrArcSec: number(hz),
    zenithStdErrArcSec: number(vz),
    distanceKind: distanceKind === UNCHANGED ? undefined : distanceKind,
    followInstrument: followInstrument || undefined,
  };
  const hasConstraint = constraintMode !== UNCHANGED;
  const nothingToDo = bulkEditIsEmpty(edit) && !hasConstraint;

  const reset = () => {
    setRole(UNCHANGED);
    setReflectorId(UNCHANGED);
    setHeightM('');
    setDistanceMm('');
    setPpm('');
    setHz('');
    setVz('');
    setDistanceKind(UNCHANGED);
    setFollowInstrument(false);
    setConstraintMode(UNCHANGED);
  };

  const apply = () => {
    if (!bulkEditIsEmpty(edit)) onApply(edit);
    if (constraintMode !== UNCHANGED) {
      onConstraint({ mode: constraintMode, sigmaMm: number(constraintSigmaMm) });
    }
    reset();
    setAnchor(null);
  };

  return (
    <Box
      data-testid="target-bulk-bar"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 3,
        border: '1px solid',
        borderColor: 'primary.main',
        borderRadius: 1.5,
        bgcolor: 'primary.50',
        px: 1,
        py: 0.6,
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip size="small" color="primary" label={t('wizard.targets.bulkCount', { count })} />
        <Divider orientation="vertical" flexItem />
        <Button size="small" onClick={() => onQuickToggle({ includeInAdjustment: true })}>
          {t('wizard.targets.bulkAdjustOn')}
        </Button>
        <Button size="small" color="inherit" onClick={() => onQuickToggle({ includeInAdjustment: false })}>
          {t('wizard.targets.bulkAdjustOff')}
        </Button>
        <Divider orientation="vertical" flexItem />
        <Button size="small" color="success" onClick={() => onQuickToggle({ publishOutput: true })}>
          {t('wizard.targets.bulkPublishOn')}
        </Button>
        <Button size="small" color="inherit" onClick={() => onQuickToggle({ publishOutput: false })}>
          {t('wizard.targets.bulkPublishOff')}
        </Button>
        <Divider orientation="vertical" flexItem />
        <Button
          size="small"
          variant="contained"
          onClick={(event) => setAnchor(event.currentTarget)}
          data-testid="open-bulk-editor"
        >
          {t('wizard.targets.bulkEdit')}
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" color="inherit" onClick={onClear}>{t('wizard.targets.bulkClear')}</Button>
      </Stack>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 1.5, width: 420, borderRadius: 2 } } }}
      >
        <Stack spacing={1.25}>
          <Typography variant="subtitle2" fontWeight={800}>{t('wizard.targets.bulkTitle', { count })}</Typography>
          <Typography variant="caption" color="text.secondary">{t('wizard.targets.bulkHint')}</Typography>

          <Stack direction="row" spacing={1}>
            <FormControl size="small" fullWidth>
              <InputLabel id="bulk-role">{t('wizard.targets.role')}</InputLabel>
              <Select
                labelId="bulk-role"
                label={t('wizard.targets.role')}
                value={role}
                onChange={(event) => setRole(event.target.value as TargetRole | '')}
              >
                <MenuItem value={UNCHANGED}>{t('wizard.targets.bulkUnchanged')}</MenuItem>
                <MenuItem value="reference">{t('enums.role.reference')}</MenuItem>
                <MenuItem value="monitoring">{t('enums.role.monitoring')}</MenuItem>
                <MenuItem value="auxiliary">{t('enums.role.auxiliary')}</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              type="number"
              label={t('wizard.targets.targetHeight')}
              value={heightM}
              onChange={(event) => setHeightM(event.target.value)}
              inputProps={{ step: 0.001 }}
              sx={{ width: 140 }}
            />
          </Stack>

          <FormControl size="small" fullWidth>
            <InputLabel id="bulk-reflector">{t('wizard.targets.reflector')}</InputLabel>
            <Select
              labelId="bulk-reflector"
              label={t('wizard.targets.reflector')}
              value={reflectorId}
              onChange={(event) => setReflectorId(event.target.value)}
              SelectDisplayProps={displayTestId('bulk-reflector')}
            >
              <MenuItem value={UNCHANGED}>{t('wizard.targets.bulkUnchanged')}</MenuItem>
              {reflectors.map((option) => (
                <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">{t('wizard.targets.bulkPrecision')}</Typography>
          </Divider>

          <FormControlLabel
            control={<Switch size="small" checked={followInstrument} onChange={(event) => setFollowInstrument(event.target.checked)} />}
            label={<Typography variant="caption">{t('wizard.targets.followInstrument')}</Typography>}
            data-testid="bulk-follow-instrument"
          />
          <Stack direction="row" spacing={1}>
            <TextField size="small" type="number" label={t('wizard.precision.sigmaDistance')} value={distanceMm} disabled={followInstrument} onChange={(event) => setDistanceMm(event.target.value)} inputProps={{ step: 0.05, min: 0 }} />
            <TextField size="small" type="number" label={t('wizard.precision.ppm')} value={ppm} disabled={followInstrument} onChange={(event) => setPpm(event.target.value)} inputProps={{ step: 0.1, min: 0 }} />
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField size="small" type="number" label={t('wizard.precision.sigmaHz')} value={hz} disabled={followInstrument} onChange={(event) => setHz(event.target.value)} inputProps={{ step: 0.05, min: 0 }} />
            <TextField size="small" type="number" label={t('wizard.precision.sigmaVz')} value={vz} disabled={followInstrument} onChange={(event) => setVz(event.target.value)} inputProps={{ step: 0.05, min: 0 }} />
            <FormControl size="small" sx={{ minWidth: 130 }} disabled={followInstrument}>
              <InputLabel id="bulk-distance-kind">{t('wizard.precision.distanceKind')}</InputLabel>
              <Select
                labelId="bulk-distance-kind"
                label={t('wizard.precision.distanceKind')}
                value={distanceKind}
                onChange={(event) => setDistanceKind(event.target.value as DistanceKind | '')}
              >
                <MenuItem value={UNCHANGED}>{t('wizard.targets.bulkUnchanged')}</MenuItem>
                <MenuItem value="slope">{t('enums.distanceKind.slope')}</MenuItem>
                <MenuItem value="horizontal">{t('enums.distanceKind.horizontal')}</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          <Divider textAlign="left">
            <Typography variant="caption" color="text.secondary">{t('wizard.targets.columnControl')}</Typography>
          </Divider>

          <Stack direction="row" spacing={1}>
            <FormControl size="small" fullWidth>
              <InputLabel id="bulk-constraint">{t('wizard.targets.bulkConstraint')}</InputLabel>
              <Select
                labelId="bulk-constraint"
                label={t('wizard.targets.bulkConstraint')}
                value={constraintMode}
                onChange={(event) => setConstraintMode(event.target.value as ConstraintMode | '')}
                SelectDisplayProps={displayTestId('bulk-constraint')}
              >
                <MenuItem value={UNCHANGED}>{t('wizard.targets.bulkUnchanged')}</MenuItem>
                <MenuItem value="fixed">{t('enums.constraint.fixed')}</MenuItem>
                <MenuItem value="weak">{t('enums.constraint.weak')}</MenuItem>
                <MenuItem value="free">{t('enums.constraint.free')}</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              type="number"
              label={t('wizard.targets.constraintSigma')}
              value={constraintSigmaMm}
              disabled={constraintMode !== 'weak'}
              onChange={(event) => setConstraintSigmaMm(event.target.value)}
              inputProps={{ step: 0.1, min: 0 }}
              sx={{ width: 140 }}
            />
          </Stack>

          <Button
            variant="contained"
            disabled={nothingToDo}
            onClick={apply}
            data-testid="apply-bulk-edit"
          >
            {t('wizard.targets.bulkApply', { count })}
          </Button>
        </Stack>
      </Popover>
    </Box>
  );
}
