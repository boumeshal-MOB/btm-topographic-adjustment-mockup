import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Popover, Stack, TextField, Typography } from '@mui/material';
import type { WizardDraft } from '@/demo/draft';
import { resolveNetworkCoordinates, withManualCoordinate } from '@/demo/network-coordinates';

/**
 * Correcting by hand the coordinate of one point.
 *
 * A single popover shared by the whole table, opened from the row: a station carries up to a hundred
 * prisms, and a form field per row per component is the density this rebuild was asked to remove.
 *
 * Writing the value the point already has *removes* the override rather than freezing it — an
 * override that merely repeats the computation would silently stop following it on the next run.
 */
export function CoordinateOverrideEditor({
  draft,
  update,
  pointKey,
  anchorEl,
  onClose,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
  pointKey: string | undefined;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const resolved = pointKey ? resolveNetworkCoordinates(draft).get(pointKey) : undefined;
  const [draftValue, setDraftValue] = useState<Record<'eastingM' | 'northingM' | 'heightM', string>>();

  const current = {
    eastingM: draftValue?.eastingM ?? (resolved ? String(resolved.eastingM) : ''),
    northingM: draftValue?.northingM ?? (resolved ? String(resolved.northingM) : ''),
    heightM: draftValue?.heightM ?? (resolved ? String(resolved.heightM) : ''),
  };

  const close = () => {
    setDraftValue(undefined);
    onClose();
  };

  const apply = () => {
    if (!pointKey) return close();
    const numbers = {
      eastingM: Number(current.eastingM),
      northingM: Number(current.northingM),
      heightM: Number(current.heightM),
    };
    if (Object.values(numbers).every((value) => Number.isFinite(value))) {
      update({
        initialisation: {
          ...draft.initialisation,
          enteredCoordinates: withManualCoordinate(draft, pointKey, numbers),
        },
      });
    }
    return close();
  };

  const reset = () => {
    if (!pointKey) return close();
    update({
      initialisation: {
        ...draft.initialisation,
        enteredCoordinates: draft.initialisation.enteredCoordinates
          .filter((entry) => entry.pointKey !== pointKey),
      },
    });
    return close();
  };

  return (
    <Popover
      open={Boolean(anchorEl && pointKey)}
      anchorEl={anchorEl}
      onClose={close}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Stack spacing={1.25} sx={{ p: 1.5, minWidth: 260 }} data-testid="coordinate-override">
        <Stack spacing={0.25}>
          <Typography variant="subtitle2" fontFamily="monospace">{pointKey}</Typography>
          <Typography variant="caption" color="text.secondary">
            {resolved ? t(`wizard.datum.origin.${resolved.origin}`) : t('wizard.datum.noCoordinate')}
          </Typography>
        </Stack>
        {(['eastingM', 'northingM', 'heightM'] as const).map((component, index) => (
          <TextField
            key={component}
            size="small"
            type="number"
            label={`${['E', 'N', 'H'][index]} (m)`}
            value={current[component]}
            onChange={(event) => setDraftValue({ ...current, [component]: event.target.value })}
            inputProps={{ step: 0.0001 }}
            data-testid={`override-${component}`}
          />
        ))}
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          {resolved?.origin === 'manual' && (
            <Button size="small" color="inherit" onClick={reset} data-testid="override-reset">
              {t('wizard.datum.resetOverride')}
            </Button>
          )}
          <Button size="small" variant="contained" onClick={apply} data-testid="override-apply">
            {t('wizard.datum.applyOverride')}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">{t('wizard.datum.overrideNote')}</Typography>
      </Stack>
    </Popover>
  );
}
