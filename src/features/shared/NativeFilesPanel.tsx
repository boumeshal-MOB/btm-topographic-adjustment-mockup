import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  hasNotableLines,
  highlightNativeText,
  nativeFileKind,
  type NativeFileKind,
  type NativeTokenRole,
} from '@/domain/starnet/native-highlight';

export interface NativeFileEntry {
  name: string;
  content: string;
  /** Size reported by the producer. Defaults to the length of `content`. */
  sizeBytes?: number;
}

/**
 * Colour never carries meaning alone (PRODUIT-ET-PARCOURS.md): every role also differs in
 * weight or style, and the legend names them.
 */
const ROLE_STYLE: Record<NativeTokenRole, { color: string; fontWeight?: number; fontStyle?: string }> = {
  plain: { color: 'text.primary' },
  comment: { color: 'text.disabled', fontStyle: 'italic' },
  record: { color: '#1565C0', fontWeight: 800 },
  name: { color: 'text.primary', fontWeight: 700 },
  fixed: { color: '#D32F2F', fontWeight: 900 },
  free: { color: '#E65100', fontWeight: 900 },
  sigma: { color: '#00796B', fontWeight: 700 },
  key: { color: 'text.secondary' },
  value: { color: '#AD1457', fontWeight: 700 },
  section: { color: '#1565C0', fontWeight: 700 },
  pass: { color: '#1B5E20', fontWeight: 700 },
  fail: { color: '#B71C1C', fontWeight: 800 },
  warn: { color: '#E65100', fontWeight: 700 },
};

const LEGEND: Partial<Record<NativeFileKind, NativeTokenRole[]>> = {
  dat: ['record', 'name', 'fixed', 'free', 'sigma'],
  prj: ['section', 'key', 'value'],
  listing: ['pass', 'fail', 'warn', 'value'],
};

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
 * copied and downloaded from the screen — with the decisive tokens highlighted — instead of being
 * reconstructed by hand when a native run disagrees with the preview engine.
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
  const [notableOnly, setNotableOnly] = useState(false);

  // The list changes when another trial is selected or a native result arrives.
  useEffect(() => {
    setCopied(false);
    if (!available.some((file) => file.name === selectedName)) {
      setSelectedName(available[0]?.name ?? '');
    }
  }, [available, selectedName]);

  const selected = available.find((file) => file.name === selectedName) ?? available[0];
  const kind = selected ? nativeFileKind(selected.name) : 'text';
  const lines = useMemo(
    () => (selected ? highlightNativeText(selected.content, kind) : []),
    [selected, kind],
  );
  const filterable = hasNotableLines(lines);
  const shown = filterable && notableOnly ? lines.filter((line) => line.notable) : lines;
  const gutterWidth = `${String(lines.length).length + 1}ch`;

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
                <ToggleButton
                  key={file.name}
                  value={file.name}
                  sx={{ textTransform: 'none', fontFamily: 'monospace' }}
                >
                  {file.name}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
              {t('nativeFiles.meta', {
                lines: lines.length,
                size: kilobytes(selected.sizeBytes ?? selected.content.length),
              })}
            </Typography>
            <Stack direction="row" spacing={1}>
              {filterable && (
                <Tooltip title={t('nativeFiles.notableHelp')}>
                  <Button
                    size="small"
                    variant={notableOnly ? 'contained' : 'outlined'}
                    onClick={() => setNotableOnly((value) => !value)}
                    data-testid="native-files-notable"
                  >
                    {t('nativeFiles.notable')}
                  </Button>
                </Tooltip>
              )}
              <Button size="small" variant="outlined" onClick={copy}>
                {copied ? t('nativeFiles.copied') : t('nativeFiles.copy')}
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => downloadText(
                  `${downloadPrefix ? `${downloadPrefix}-` : ''}${selected.name}`,
                  selected.content,
                )}
              >
                {t('nativeFiles.download')}
              </Button>
            </Stack>
          </Stack>

          {(LEGEND[kind] ?? []).length > 0 && (
            <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
              {(LEGEND[kind] ?? []).map((role) => (
                <Typography key={role} variant="caption" sx={{ ...ROLE_STYLE[role], fontFamily: 'monospace' }}>
                  {t(`nativeFiles.legend.${role}`)}
                </Typography>
              ))}
            </Stack>
          )}

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
              lineHeight: 1.5,
            }}
          >
            {shown.map((line) => (
              <Box key={line.number} component="span" sx={{ display: 'block', whiteSpace: 'pre' }}>
                <Box
                  component="span"
                  aria-hidden
                  sx={{
                    display: 'inline-block',
                    width: gutterWidth,
                    mr: 1.5,
                    textAlign: 'right',
                    color: 'text.disabled',
                    userSelect: 'none',
                  }}
                >
                  {line.number}
                </Box>
                {line.tokens.map((token, index) => (
                  <Box
                    key={`${line.number}-${index}`}
                    component="span"
                    sx={ROLE_STYLE[token.role]}
                  >
                    {token.text}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
          {filterable && notableOnly && (
            <Typography variant="caption" color="text.secondary">
              {t('nativeFiles.notableCount', { shown: shown.length, total: lines.length })}
            </Typography>
          )}
        </>
      )}
    </Stack>
  );
}
