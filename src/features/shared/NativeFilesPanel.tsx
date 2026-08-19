import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';

export interface NativeFileEntry {
  name: string;
  content: string;
  /** Size reported by the producer. Defaults to the length of `content`. */
  sizeBytes?: number;
}

function kilobytes(value: number): string {
  return `${(value / 1024).toFixed(1)} kB`;
}

function downloadText(name: string, content: string): void {
  const href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

/**
 * Reads the text files a run is made of: the generated `.dat`/`.prj` and the native STAR*NET
 * output. These are the only artefacts that say what was actually computed, so they are inspected,
 * copied and downloaded from the screen instead of being reconstructed by hand when a native run
 * disagrees with the preview engine.
 */
export function NativeFilesPanel({
  files,
  error,
  warnings = [],
  emptyMessage,
  downloadPrefix,
  maxHeight = 380,
  testId = 'native-files',
}: {
  files: NativeFileEntry[];
  /** Set when the files could not be produced at all; nothing is then offered for download. */
  error?: string;
  warnings?: string[];
  emptyMessage?: string;
  /** Prefix applied to downloaded filenames, e.g. a run id. */
  downloadPrefix?: string;
  maxHeight?: number;
  testId?: string;
}) {
  const { t } = useTranslation();
  const available = useMemo(() => files.filter((file) => file.content.length > 0), [files]);
  const [selectedName, setSelectedName] = useState(available[0]?.name ?? '');
  const [copied, setCopied] = useState(false);

  // The list changes when another trial is selected or a native result arrives.
  useEffect(() => {
    setCopied(false);
    if (!available.some((file) => file.name === selectedName)) {
      setSelectedName(available[0]?.name ?? '');
    }
  }, [available, selectedName]);

  const selected = available.find((file) => file.name === selectedName) ?? available[0];

  const copy = async () => {
    const clipboard = window.navigator?.clipboard;
    if (!selected || !clipboard) return;
    try {
      await clipboard.writeText(selected.content);
      setCopied(true);
    } catch {
      setCopied(false); // clipboard blocked by the browser: the download stays available
    }
  };

  return (
    <Stack spacing={1} data-testid={testId}>
      {error && <Alert severity="error">{t('nativeFiles.unavailable', { message: error })}</Alert>}
      {warnings.map((warning) => (
        <Alert key={warning} severity="warning" variant="outlined">{warning}</Alert>
      ))}
      {!error && !selected && (
        <Alert severity="info" variant="outlined">{emptyMessage ?? t('nativeFiles.empty')}</Alert>
      )}
      {selected && (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={selected.name}
              onChange={(_, value: string | null) => value && setSelectedName(value)}
              aria-label={t('nativeFiles.select')}
              sx={{ flexWrap: 'wrap' }}
            >
              {available.map((file) => (
                <ToggleButton key={file.name} value={file.name} sx={{ textTransform: 'none', fontFamily: 'monospace' }}>
                  {file.name}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
              {t('nativeFiles.meta', {
                lines: selected.content.split('\n').length,
                size: kilobytes(selected.sizeBytes ?? selected.content.length),
              })}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={copy}>
                {copied ? t('nativeFiles.copied') : t('nativeFiles.copy')}
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => downloadText(`${downloadPrefix ? `${downloadPrefix}-` : ''}${selected.name}`, selected.content)}
              >
                {t('nativeFiles.download')}
              </Button>
            </Stack>
          </Stack>
          <Box
            component="pre"
            aria-label={selected.name}
            sx={{
              p: 1.5,
              m: 0,
              bgcolor: 'grey.100',
              borderRadius: 1,
              maxHeight,
              overflow: 'auto',
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            {selected.content}
          </Box>
        </>
      )}
    </Stack>
  );
}
