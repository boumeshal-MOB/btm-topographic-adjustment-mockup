import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import {
  coordinateCsvTemplate,
  parseCoordinateCsv,
  type CoordinateCsvKind,
  type CoordinateCsvResult,
} from '@/domain/initialisation/coordinate-csv';
import { fixed, millimetres } from '@/features/shared/format';

function downloadTemplate(kind: CoordinateCsvKind): void {
  const href = URL.createObjectURL(new Blob([coordinateCsvTemplate(kind)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = kind === 'references' ? 'references.csv' : 'initial.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

/**
 * Import of a coordinate file, reviewed before it is applied.
 *
 * Two files, because they answer two different questions: a known reference comes with the standard
 * errors that say how well it is known, an initial coordinate is a mere approximation and a sigma
 * there would claim a control that does not exist. Nothing is applied partially — every rejected
 * line is shown with its number, and the user decides.
 */
export function CoordinateCsvImport({
  kind,
  onApply,
  testId,
}: {
  kind: CoordinateCsvKind;
  onApply: (result: CoordinateCsvResult) => void;
  testId?: string;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<CoordinateCsvResult>();
  const [fileName, setFileName] = useState('');

  const read = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setFileName(file.name);
    setParsed(parseCoordinateCsv(await file.text(), kind));
  };

  return (
    <Stack spacing={1} data-testid={testId}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Button size="small" variant="outlined" onClick={() => inputRef.current?.click()}>
          {t(`wizard.csv.choose.${kind}`)}
        </Button>
        <Button size="small" onClick={() => downloadTemplate(kind)}>{t('wizard.csv.template')}</Button>
        <Typography variant="caption" color="text.secondary">{t(`wizard.csv.format.${kind}`)}</Typography>
        <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={read} />
      </Stack>

      {parsed && (
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary">
            {t('wizard.csv.read', { file: fileName, separator: parsed.separator, count: parsed.rows.length })}
          </Typography>
          {parsed.errors.length > 0 && (
            <Alert severity="warning" variant="outlined">
              <Stack component="ul" sx={{ m: 0, pl: 2.2 }} spacing={0.15}>
                {parsed.errors.slice(0, 8).map((error) => (
                  <Typography key={`${error.line}-${error.message}`} component="li" variant="caption">
                    {t('wizard.csv.lineError', { line: error.line, message: error.message })}
                  </Typography>
                ))}
                {parsed.errors.length > 8 && (
                  <Typography component="li" variant="caption">
                    {t('wizard.csv.moreErrors', { count: parsed.errors.length - 8 })}
                  </Typography>
                )}
              </Stack>
            </Alert>
          )}
          {parsed.rows.length > 0 && (
            <Box
              component="pre"
              sx={{ m: 0, p: 1, bgcolor: 'grey.100', borderRadius: 1, fontSize: 11.5, maxHeight: 150, overflow: 'auto' }}
            >
              {parsed.rows.slice(0, 12).map((row) => [
                row.name.padEnd(12),
                fixed(row.eastingM, 4).padStart(13),
                fixed(row.northingM, 4).padStart(13),
                fixed(row.heightM, 4).padStart(10),
                row.sigmaEM === undefined
                  ? ''
                  : `   σ ${millimetres(row.sigmaEM, 1)} / ${millimetres(row.sigmaNM, 1)} / ${millimetres(row.sigmaHM, 1)} mm`,
              ].join('')).join('\n')}
            </Box>
          )}
          <Button
            size="small"
            variant="contained"
            disabled={parsed.rows.length === 0}
            onClick={() => {
              onApply(parsed);
              setParsed(undefined);
            }}
            sx={{ alignSelf: 'flex-start' }}
            data-testid={testId ? `${testId}-apply` : undefined}
          >
            {t('wizard.csv.apply', { count: parsed.rows.length })}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
