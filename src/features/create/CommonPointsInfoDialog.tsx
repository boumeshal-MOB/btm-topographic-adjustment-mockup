import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { GeometryCheck } from '@/domain/point-identity/local-geometry';
import { millimetres } from '@/features/shared/format';

const STAGES = [
  {
    index: '01',
    title: 'Processed observations',
    detail: 'Use Hz, Vz and corrected slope distance inside the selected initialisation window.',
  },
  {
    index: '02',
    title: 'Station-local clouds',
    detail: 'Keep the latest processed observation for each included target and derive a local 3D point.',
  },
  {
    index: '03',
    title: 'Frame alignment',
    detail: 'Solve one horizontal rotation and one 3D translation from the seed pairs.',
  },
  {
    index: '04',
    title: 'Match proposals',
    detail: 'Search the aligned clouds within the horizontal and vertical tolerances. Nothing is auto-linked.',
  },
] as const;

const CHECKS = [
  ['Observation coverage', 'Each seed target must have a processed observation in the chosen window.'],
  ['Seed identity', 'Use at least two unique pairs; three well-spread pairs add redundancy.'],
  ['Complete measurement', 'A processed polar observation needs valid Hz, Vz and slope distance.'],
  ['Corrections and heights', 'Resolved prism, atmosphere, instrument height and target height feed the local cloud.'],
  ['Tolerances', 'They are evaluated only after the two station frames can be aligned.'],
] as const;

export function CommonPointsInfoDialog({
  open,
  onClose,
  check,
  stationA,
  stationB,
}: {
  open: boolean;
  onClose: () => void;
  check?: GeometryCheck;
  stationA: string;
  stationB: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth aria-labelledby="common-points-info-title">
      <DialogTitle id="common-points-info-title">How common-point matching works</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          <Typography color="text.secondary">
            The assistant compares two independent station-local point clouds. Target names are only identifiers:
            they never prove that two targets are the same physical point.
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
              gap: 1.25,
            }}
          >
            {STAGES.map((stage) => (
              <Paper
                key={stage.index}
                variant="outlined"
                sx={{ p: 1.5, minHeight: 132, borderColor: 'primary.light', bgcolor: 'primary.50' }}
              >
                <Stack spacing={1}>
                  <Chip label={stage.index} size="small" color="primary" sx={{ alignSelf: 'flex-start', fontWeight: 700 }} />
                  <Typography variant="subtitle2" fontWeight={700}>{stage.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{stage.detail}</Typography>
                </Stack>
              </Paper>
            ))}
          </Box>

          {check ? (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={1.25}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                  <Typography variant="subtitle2" fontWeight={700}>Latest analysis inputs</Typography>
                  <Chip
                    size="small"
                    color={check.status === 'ready' ? 'success' : check.status === 'weak' ? 'warning' : 'error'}
                    label={check.diagnostics.stage.replace('-', ' ')}
                  />
                </Stack>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
                  <Metric label={stationA || 'Station A'} value={`${check.diagnostics.stationAPointCount} points`} />
                  <Metric label={stationB || 'Station B'} value={`${check.diagnostics.stationBPointCount} points`} />
                  <Metric label="Seed coverage" value={`${check.diagnostics.validSeedCount}/${check.diagnostics.requestedSeedCount}`} />
                  <Metric
                    label="Search tolerances"
                    value={`${millimetres(check.diagnostics.horizontalToleranceM, 0)} / ${millimetres(check.diagnostics.verticalToleranceM, 0)} mm`}
                  />
                </Box>
                {check.diagnostics.validSeedCount < 2 && (
                  <Alert severity="error">
                    The seed selections exist, but fewer than two pairs are present in both processed point clouds.
                    Check the observation window and the complete Hz/Vz/Sd blocks first.
                  </Alert>
                )}
              </Stack>
            </Paper>
          ) : (
            <Alert severity="info" variant="outlined">
              Run the analysis to display live point counts, valid seed coverage and the stage that stopped.
            </Alert>
          )}

          <Divider />
          <Box>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>Debug checklist</Typography>
            <Stack spacing={1}>
              {CHECKS.map(([title, detail]) => (
                <Stack key={title} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Typography variant="body2" fontWeight={700} sx={{ minWidth: 170 }}>{title}</Typography>
                  <Typography variant="body2" color="text.secondary">{detail}</Typography>
                </Stack>
              ))}
            </Stack>
          </Box>

          <Alert severity="warning" variant="outlined">
            Two valid seed pairs solve the relative frame but provide no redundancy. Three or more well-distributed
            pairs are recommended. Every proposed match still requires explicit confirmation.
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'grey.50' }}>
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="body2" fontWeight={700}>{value}</Typography>
    </Box>
  );
}
