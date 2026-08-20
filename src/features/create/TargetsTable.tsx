import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Checkbox,
  Chip,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { ConstraintMode } from '@/domain/entities';
import { COMPONENTS, componentConstraint, type Component } from '@/features/create/datum-view-model';
import {
  targetKey,
  type TargetStationGroup,
  type TargetTableRow,
} from '@/features/create/target-table-view-model';
import { CUSTOM_REFLECTOR_ID, type ReflectorOption } from '@/domain/instruments/reflector-catalogue';

/** A value the sight restates for itself, rather than inheriting. Outside the quality scale. */
const OVERRIDE_COLOUR = '#C026D3';

const CONSTRAINT_COLOUR: Record<ConstraintMode, string> = {
  fixed: 'error.main',
  weak: 'primary.main',
  free: 'text.disabled',
};

/**
 * One clickable token per component: what holds this axis, and a menu to change it.
 *
 * A token, not a dropdown, because a hundred rows of three dropdowns is nine hundred mounted
 * selects — and because the answer a surveyor is looking for ("is N held, and how tightly?") is a
 * glance, not a click. The menu carries the three explicit choices so nothing has to be guessed
 * from a cycling click.
 */
function ConstraintToken({
  component,
  mode,
  sigmaMm,
  label,
  disabled,
  allowFixed = true,
  onChange,
}: {
  component: Component;
  mode: ConstraintMode;
  sigmaMm: number;
  label: string;
  disabled?: boolean;
  /** False for a station: it carries the instrument, not the reference, so it is never fixed. */
  allowFixed?: boolean;
  onChange: (mode: ConstraintMode) => void;
}) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      {/* A native `title`, not a MUI Tooltip: a station of a hundred prisms mounts three of these per
          row, and three hundred Tooltip instances cost far more than the hint is worth. */}
      <Box
        component="button"
        type="button"
        disabled={disabled}
        onClick={(event) => setAnchor(event.currentTarget)}
        data-testid={`constraint-${label}-${component}`}
        aria-label={`${label} ${component}`}
        title={`${label} ${component} · ${t(`enums.constraint.${mode}`)}`}
        sx={{
          all: 'unset',
          cursor: disabled ? 'default' : 'pointer',
          display: 'grid',
          justifyItems: 'center',
          minWidth: 28,
          px: 0.4,
          py: 0.1,
          borderRadius: 0.75,
          border: '1px solid',
          borderColor: mode === 'free' ? 'divider' : CONSTRAINT_COLOUR[mode],
          bgcolor: mode === 'free' ? 'transparent' : 'action.hover',
          '&:hover': disabled ? undefined : { bgcolor: 'action.selected' },
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 800, lineHeight: 1.1, color: CONSTRAINT_COLOUR[mode] }}
        >
          {mode === 'fixed' ? `${component}!` : component}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 9.5, lineHeight: 1, color: 'text.secondary', fontFamily: 'monospace' }}>
          {mode === 'weak' ? sigmaMm.toFixed(1) : mode === 'fixed' ? '—' : ''}
        </Typography>
      </Box>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {(allowFixed ? ['fixed', 'weak', 'free'] as ConstraintMode[] : ['weak', 'free'] as ConstraintMode[]).map((candidate) => (
          <MenuItem
            key={candidate}
            selected={candidate === mode}
            onClick={() => { onChange(candidate); setAnchor(null); }}
            dense
          >
            {t(`enums.constraint.${candidate}`)}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** `0.8 + 1.0` — the two terms of an EDM error, in the order STAR*NET writes them. */
function PrecisionCell({ primary, secondary, overridden }: { primary: string; secondary?: string; overridden: boolean }) {
  return (
    <Typography
      variant="caption"
      fontFamily="monospace"
      sx={{
        whiteSpace: 'nowrap',
        color: overridden ? OVERRIDE_COLOUR : 'text.secondary',
        fontWeight: overridden ? 800 : 400,
      }}
    >
      {primary}{secondary ? ` + ${secondary}` : ''}
    </Typography>
  );
}

export interface TargetsTableProps {
  groups: readonly TargetStationGroup[];
  reflectors: readonly ReflectorOption[];
  selectedKeys: ReadonlySet<string>;
  activeKey?: string;
  stationSubtitle: (stationCode: string) => string;
  onToggleRow: (key: string, shiftKey: boolean) => void;
  onToggleGroup: (keys: readonly string[], selected: boolean) => void;
  onActivate: (key: string) => void;
  onPatchTarget: (index: number, patch: Partial<TargetTableRow['target']>) => void;
  onConstraint: (row: TargetTableRow, component: Component, mode: ConstraintMode) => void;
  /** The station's own coordinate record — held or free, never fixed. */
  stationConstraint: (stationCode: string, component: Component) => { mode: ConstraintMode; sigmaMm: number };
  onStationConstraint: (stationCode: string, component: Component, mode: ConstraintMode) => void;
}

/**
 * The dense sight table, read the way STAR*NET reads a data file: one block per station, references
 * first inside each block, one line per sight.
 *
 * Nothing in a row is a form control except the checkboxes and the constraint tokens. That is the
 * whole point: at a hundred prisms per station the old row — a select for the role, a select for the
 * reflector, five number fields — made a station unreadable and unusable at the same time. A row
 * now *states* its configuration; changing it is done on the selection or in the inspector.
 */
export function TargetsTable({
  groups,
  reflectors,
  selectedKeys,
  activeKey,
  stationSubtitle,
  onToggleRow,
  onToggleGroup,
  onActivate,
  onPatchTarget,
  onConstraint,
  stationConstraint,
  onStationConstraint,
}: TargetsTableProps) {
  const { t } = useTranslation();
  const reflectorLabel = (row: TargetTableRow) => {
    if (row.reflectorId === CUSTOM_REFLECTOR_ID) return t('wizard.targets.customReflector');
    return reflectors.find((option) => option.id === row.reflectorId)?.label ?? t('wizard.targets.customReflector');
  };

  const headerCell = {
    bgcolor: 'grey.100',
    color: 'text.secondary',
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: '.045em',
    lineHeight: 1.2,
    py: 0.6,
    // No `text-transform: uppercase` here: it renders every σ as Σ, and a standard error is not a
    // sum. The Analysis Lab's tables are not uppercased either.
    whiteSpace: 'nowrap' as const,
  };

  return (
    <Stack spacing={1}>
      {groups.map((group) => {
        const keys = group.rows.map((row) => targetKey(row.target));
        const selectedHere = keys.filter((key) => selectedKeys.has(key)).length;
        return (
          <Box
            key={group.stationCode}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden', bgcolor: 'background.paper' }}
            data-testid={`station-group-${group.stationCode}`}
          >
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ px: 0.75, py: 0.5, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <Checkbox
                size="small"
                sx={{ p: 0.5 }}
                checked={selectedHere === keys.length && keys.length > 0}
                indeterminate={selectedHere > 0 && selectedHere < keys.length}
                onChange={(event) => onToggleGroup(keys, event.target.checked)}
                inputProps={{ 'aria-label': `${t('wizard.targets.selectStation')} ${group.stationCode}` }}
              />
              <Typography variant="subtitle2" fontWeight={800} fontFamily="monospace">{group.stationCode}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {stationSubtitle(group.stationCode)}
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              {/* The station's own datum, next to the station it belongs to. A station is never
                  fixed — it carries the instrument, not the reference — so the token offers only a
                  constraint or nothing at all. */}
              <Stack direction="row" spacing={0.35} alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.25 }}>
                  {t('wizard.targets.stationControl')}
                </Typography>
                {COMPONENTS.map((component) => {
                  const { mode, sigmaMm } = stationConstraint(group.stationCode, component);
                  return (
                    <ConstraintToken
                      key={component}
                      component={component}
                      mode={mode}
                      sigmaMm={sigmaMm}
                      label={group.stationCode}
                      allowFixed={false}
                      onChange={(next) => onStationConstraint(group.stationCode, component, next)}
                    />
                  );
                })}
              </Stack>
              {/* The role counts are stated by the group heading rows one line below; repeating
                  them here was exactly the redundancy this rebuild was asked to remove. */}
              <Typography variant="caption" color="text.secondary">
                {t('wizard.targets.sightCount', { count: group.rows.length })}
              </Typography>
            </Stack>

            <Box sx={{ overflowX: 'auto' }}>
              <Table
                size="small"
                aria-label={t('wizard.targets.tableLabel', { station: group.stationCode })}
                sx={{ minWidth: 940 }}
              >
                <TableHead>
                  <TableRow sx={{ '& th': headerCell }}>
                    <TableCell sx={{ width: 34 }} />
                    <TableCell sx={{ width: 210 }}>{t('wizard.targets.columnTarget')}</TableCell>
                    <TableCell sx={{ width: 78 }} align="center">{t('wizard.targets.columnUsage')}</TableCell>
                    <TableCell sx={{ width: 210 }}>{t('wizard.targets.columnReflector')}</TableCell>
                    <TableCell sx={{ width: 76 }} align="right">{t('wizard.targets.columnHeight')}</TableCell>
                    <TableCell sx={{ width: 104 }}>{t('wizard.targets.columnSigmaDistance')}</TableCell>
                    <TableCell sx={{ width: 92 }}>{t('wizard.targets.columnSigmaAngles')}</TableCell>
                    <TableCell sx={{ width: 66 }}>{t('wizard.targets.columnDistanceKind')}</TableCell>
                    <TableCell sx={{ width: 118 }}>{t('wizard.targets.columnControl')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {group.byRole.map((roleGroup) => [
                    <TableRow key={`${group.stationCode}-${roleGroup.role}`}>
                      <TableCell colSpan={9} sx={{ py: 0.3, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="caption" fontWeight={900} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '.05em' }}>
                          {t(`enums.role.${roleGroup.role}`)} · {roleGroup.rows.length}
                        </Typography>
                      </TableCell>
                    </TableRow>,
                    ...roleGroup.rows.map((row) => {
                      const key = targetKey(row.target);
                      const target = row.target;
                      const isActive = key === activeKey;
                      return (
                        <TableRow
                          key={key}
                          hover
                          selected={isActive}
                          onClick={() => onActivate(key)}
                          data-testid={`target-row-${target.engineName}`}
                          sx={{
                            cursor: 'pointer',
                            opacity: target.includeInAdjustment ? 1 : 0.55,
                            '& td': { py: 0.3, borderBottom: '1px solid', borderColor: 'grey.100' },
                          }}
                        >
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              size="small"
                              sx={{ p: 0.4 }}
                              checked={selectedKeys.has(key)}
                              onClick={(event) => {
                                event.preventDefault();
                                onToggleRow(key, event.shiftKey);
                              }}
                              inputProps={{ 'aria-label': `${t('wizard.targets.select')} ${target.rawTargetName}` }}
                            />
                          </TableCell>

                          <TableCell>
                            <Stack direction="row" spacing={0.6} alignItems="baseline">
                              <Typography variant="body2" fontWeight={750} fontFamily="monospace" noWrap title={target.rawTargetName}>
                                {target.rawTargetName}
                              </Typography>
                              {target.engineName !== target.rawTargetName && (
                                <Typography variant="caption" color="text.secondary" noWrap title={target.engineName}>
                                  → {target.engineName}
                                </Typography>
                              )}
                              {target.reviewStatus !== 'ok' && (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  color={target.reviewStatus === 'blocking' ? 'error' : 'warning'}
                                  label={t(`wizard.targets.review.${target.reviewStatus === 'blocking' ? 'blocking' : 'toReview'}`)}
                                  sx={{ height: 16, '& .MuiChip-label': { px: 0.5, fontSize: 9.5 } }}
                                />
                              )}
                            </Stack>
                          </TableCell>

                          <TableCell align="center" onClick={(event) => event.stopPropagation()}>
                            <Stack direction="row" spacing={0} justifyContent="center">
                              {/* The column header reads "Adj · Pub" and each box carries its own
                                  accessible name, so a Tooltip per box would only add cost. */}
                              <Checkbox
                                size="small"
                                sx={{ p: 0.3 }}
                                checked={target.includeInAdjustment}
                                onChange={(event) => onPatchTarget(row.index, { includeInAdjustment: event.target.checked })}
                                inputProps={{
                                  'aria-label': `${t('wizard.targets.adjust')} ${target.rawTargetName}`,
                                  title: t('wizard.targets.adjust'),
                                }}
                              />
                              <Checkbox
                                size="small"
                                color="success"
                                sx={{ p: 0.3 }}
                                checked={target.publishOutput}
                                onChange={(event) => onPatchTarget(row.index, { publishOutput: event.target.checked })}
                                inputProps={{
                                  'aria-label': `${t('wizard.targets.publish')} ${target.rawTargetName}`,
                                  title: t('wizard.targets.publish'),
                                }}
                              />
                            </Stack>
                          </TableCell>

                          <TableCell>
                            <Stack direction="row" spacing={0.6} alignItems="center">
                              <Typography variant="caption" noWrap title={reflectorLabel(row)}>
                                {reflectorLabel(row)}
                              </Typography>
                              {row.constant.kind === 'btm' && (
                                <Chip
                                  size="small"
                                  color="warning"
                                  label={`BTM ${row.constant.deltaMm > 0 ? '+' : ''}${row.constant.deltaMm.toFixed(1)}`}
                                  sx={{ height: 16, '& .MuiChip-label': { px: 0.5, fontSize: 9.5, fontFamily: 'monospace' } }}
                                />
                              )}
                              {row.constant.kind === 'applied' && (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  color="success"
                                  label={t('wizard.targets.constantAppliedShort', { value: row.constant.requiredMm.toFixed(1) })}
                                  sx={{ height: 16, '& .MuiChip-label': { px: 0.5, fontSize: 9.5, fontFamily: 'monospace' } }}
                                />
                              )}
                            </Stack>
                          </TableCell>

                          <TableCell align="right">
                            <Typography variant="caption" fontFamily="monospace">{target.targetHeightM.toFixed(4)}</Typography>
                          </TableCell>

                          <TableCell>
                            <PrecisionCell
                              primary={row.precision.distanceStdErrMm.value.toFixed(2)}
                              secondary={row.precision.distancePpm.value.toFixed(1)}
                              overridden={row.precision.distanceStdErrMm.source === 'sight' || row.precision.distancePpm.source === 'sight'}
                            />
                          </TableCell>

                          <TableCell>
                            <PrecisionCell
                              primary={row.precision.directionArcSec.value.toFixed(2)}
                              secondary={row.precision.zenithArcSec.value.toFixed(2)}
                              overridden={row.precision.directionArcSec.source === 'sight' || row.precision.zenithArcSec.source === 'sight'}
                            />
                          </TableCell>

                          <TableCell>
                            <Typography
                              variant="caption"
                              sx={{
                                color: row.precision.distanceKind.source === 'sight' ? OVERRIDE_COLOUR : 'text.secondary',
                                fontWeight: row.precision.distanceKind.source === 'sight' ? 800 : 400,
                              }}
                            >
                              {t(`enums.distanceKindShort.${row.precision.distanceKind.value}`)}
                            </Typography>
                          </TableCell>

                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <Stack direction="row" spacing={0.35} alignItems="center">
                              {COMPONENTS.map((component) => {
                                const { mode, sigmaMm } = componentConstraint(row.control, component);
                                return (
                                  <ConstraintToken
                                    key={component}
                                    component={component}
                                    mode={mode}
                                    sigmaMm={sigmaMm}
                                    label={target.engineName}
                                    onChange={(next) => onConstraint(row, component, next)}
                                  />
                                );
                              })}
                              {row.control && !row.coordinateKnown && (
                                <Typography
                                  variant="caption"
                                  color="warning.main"
                                  fontWeight={900}
                                  title={t('wizard.targets.coordinateApproximate')}
                                >
                                  !
                                </Typography>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    }),
                  ])}
                </TableBody>
              </Table>
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
