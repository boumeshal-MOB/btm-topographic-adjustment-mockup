import { useMemo, useState, type ChangeEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import {
  parseStationImportFiles,
  type DetectedStationFormat,
  type ParsedStationImportBatch,
  type StationImportSourceFile,
  type SuggestedCountryTemplate,
} from '@/domain/station-import';

const MAX_FILES = 20;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 75 * 1024 * 1024;
const STATION_CODE = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;

interface ImportResponse {
  importId: string;
  stationCodes: string[];
}

interface Props {
  existingStationCodes: string[];
  currentTemplate: Exclude<SuggestedCountryTemplate, 'REVIEW'>;
  onImported: (stationCodes: string[]) => void;
  onError: (message: string) => void;
}

function excludedCount(candidate: ParsedStationImportBatch['candidates'][number]): number {
  return candidate.failures.missingOrNonFinite
    + candidate.failures.angleOutOfRange
    + candidate.failures.distanceNotPositive
    + candidate.failures.malformedRows;
}

function readTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsText(file);
  });
}

export function StationImportDialog({ existingStationCodes, currentTemplate, onImported, onError }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string>();
  const [parsed, setParsed] = useState<ParsedStationImportBatch>();
  const [stationCodes, setStationCodes] = useState<Record<string, string>>({});

  const close = () => {
    if (parsing) return;
    setOpen(false);
    setParsed(undefined);
    setParseError(undefined);
    setStationCodes({});
  };

  const importStations = useMutation({
    mutationFn: () => api<ImportResponse>('POST', '/api/v2/catalogue/station-imports', {
      parsed,
      stationCodes,
    }),
    onSuccess: (response) => {
      close();
      onImported(response.stationCodes);
    },
    onError: (error) => {
      const message = String(error);
      setParseError(message);
      onError(message);
    },
  });

  const validation = useMemo(() => {
    if (!parsed) return { valid: false, messages: [] as string[] };
    const existing = new Set(existingStationCodes.map((code) => code.toUpperCase()));
    const selected = parsed.candidates.map((candidate) =>
      (stationCodes[candidate.stationCode] ?? candidate.stationCode).trim().toUpperCase());
    const messages: string[] = [];
    selected.forEach((code) => {
      if (!STATION_CODE.test(code)) messages.push(t('wizard.stations.import.invalidCode', { code: code || '—' }));
      if (existing.has(code)) messages.push(t('wizard.stations.import.codeExists', { code }));
      if (selected.filter((candidate) => candidate === code).length > 1) {
        messages.push(t('wizard.stations.import.codeDuplicated', { code }));
      }
    });
    return { valid: messages.length === 0, messages: [...new Set(messages)] };
  }, [existingStationCodes, parsed, stationCodes, t]);

  const chooseFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    setParsed(undefined);
    setStationCodes({});
    setParseError(undefined);
    if (files.length === 0) return;
    if (files.length > MAX_FILES) {
      setParseError(t('wizard.stations.import.tooManyFiles', { count: MAX_FILES }));
      return;
    }
    const oversized = files.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) {
      setParseError(t('wizard.stations.import.fileTooLarge', { name: oversized.name }));
      return;
    }
    if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
      setParseError(t('wizard.stations.import.batchTooLarge'));
      return;
    }
    setParsing(true);
    try {
      const sources: StationImportSourceFile[] = await Promise.all(files.map(async (file) => ({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        content: await readTextFile(file),
      })));
      const result = parseStationImportFiles(sources);
      setParsed(result);
      setStationCodes(Object.fromEntries(result.candidates.map((candidate) => [candidate.stationCode, candidate.stationCode])));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : String(error));
    } finally {
      setParsing(false);
    }
  };

  const formatLabel = (format: DetectedStationFormat) => t(`wizard.stations.import.formats.${format}`);
  const templateMismatch = parsed?.candidates.some((candidate) =>
    candidate.suggestedTemplate !== 'REVIEW' && candidate.suggestedTemplate !== currentTemplate) ?? false;

  return (
    <>
      <Button variant="outlined" onClick={() => setOpen(true)} data-testid="open-station-import">
        {t('wizard.stations.import.action')}
      </Button>
      <Dialog open={open} onClose={close} maxWidth="lg" fullWidth>
        <DialogTitle>{t('wizard.stations.import.title')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>{t('wizard.stations.import.description')}</DialogContentText>
            <Alert severity="info" variant="outlined">
              {t('wizard.stations.import.supported')}
            </Alert>
            <Box>
              <Button component="label" variant="contained" disabled={parsing || importStations.isPending}>
                {parsed ? t('wizard.stations.import.chooseOther') : t('wizard.stations.import.choose')}
                <input
                  hidden
                  multiple
                  type="file"
                  accept=".dat,.csv,.tsv,.txt,text/plain,text/csv"
                  onChange={(event) => void chooseFiles(event)}
                  data-testid="station-files"
                />
              </Button>
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
                {t('wizard.stations.import.limits')}
              </Typography>
            </Box>
            {parsing && <LinearProgress aria-label={t('wizard.stations.import.detecting')} />}
            {parseError && <Alert severity="error">{parseError}</Alert>}
            {parsed && (
              <>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {parsed.sourceFiles.map((file) => (
                    <Chip key={file.name} size="small" label={`${file.name} · ${(file.size / 1024).toFixed(0)} kB`} />
                  ))}
                </Stack>
                {templateMismatch && (
                  <Alert severity="warning">
                    {t('wizard.stations.import.templateMismatch', { template: currentTemplate })}
                  </Alert>
                )}
                {validation.messages.map((message) => <Alert severity="error" key={message}>{message}</Alert>)}
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small" aria-label={t('wizard.stations.import.previewTable')}>
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('wizard.stations.import.station')}</TableCell>
                        <TableCell>{t('wizard.stations.import.format')}</TableCell>
                        <TableCell>{t('wizard.stations.import.template')}</TableCell>
                        <TableCell>{t('wizard.stations.import.angleUnit')}</TableCell>
                        <TableCell align="right">{t('wizard.stations.import.sourceRows')}</TableCell>
                        <TableCell align="right">{t('wizard.stations.import.acquisitions')}</TableCell>
                        <TableCell align="right">{t('wizard.stations.import.targets')}</TableCell>
                        <TableCell align="right">{t('wizard.stations.import.observations')}</TableCell>
                        <TableCell align="right">{t('wizard.stations.import.excluded')}</TableCell>
                        <TableCell>{t('wizard.stations.import.period')}</TableCell>
                        <TableCell>{t('wizard.stations.import.environment')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {parsed.candidates.map((candidate) => (
                        <TableRow key={candidate.stationCode}>
                          <TableCell sx={{ minWidth: 170 }}>
                            <TextField
                              size="small"
                              value={stationCodes[candidate.stationCode] ?? candidate.stationCode}
                              onChange={(event) => setStationCodes((current) => ({
                                ...current,
                                [candidate.stationCode]: event.target.value.toUpperCase(),
                              }))}
                              label={t('wizard.stations.import.stationCode')}
                              inputProps={{ 'aria-label': t('wizard.stations.import.stationCodeFor', { code: candidate.stationCode }) }}
                            />
                          </TableCell>
                          <TableCell>{formatLabel(candidate.detectedFormat)}</TableCell>
                          <TableCell>{candidate.suggestedTemplate === 'REVIEW'
                            ? t('wizard.stations.import.templateReview')
                            : candidate.suggestedTemplate}</TableCell>
                          <TableCell>{candidate.sourceAngleUnit}</TableCell>
                          <TableCell align="right">{candidate.sourceRowCount}</TableCell>
                          <TableCell align="right">{candidate.acquisitionEpochs.length}</TableCell>
                          <TableCell align="right">{candidate.targetNames.length}</TableCell>
                          <TableCell align="right">{candidate.observations.length}</TableCell>
                          <TableCell align="right">{excludedCount(candidate)}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {candidate.acquisitionEpochs[0]?.slice(0, 10)} → {candidate.acquisitionEpochs.at(-1)?.slice(0, 10)}
                          </TableCell>
                          <TableCell>{candidate.environment.length > 0
                            ? t('wizard.stations.import.yes')
                            : t('wizard.stations.import.no')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
                {parsed.candidates.flatMap((candidate) => candidate.warnings.map((warning) => (
                  <Alert severity="warning" variant="outlined" key={`${candidate.stationCode}-${warning}`}>
                    <strong>{candidate.stationCode}</strong> — {warning}
                  </Alert>
                )))}
                <Alert severity="success" variant="outlined">
                  {t('wizard.stations.import.persistence')}
                </Alert>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={parsing || importStations.isPending}>
            {t('wizard.stations.import.cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={!parsed || !validation.valid || parsing || importStations.isPending}
            onClick={() => importStations.mutate()}
            data-testid="confirm-station-import"
          >
            {importStations.isPending ? t('wizard.stations.import.importing') : t('wizard.stations.import.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
