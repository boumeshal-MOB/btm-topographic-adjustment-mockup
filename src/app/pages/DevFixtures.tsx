import { Alert, Container, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import fixture from '@/demo/fixtures/ats34.generated.json';
import type { Ats34Fixture } from '@/demo/fixtures/contract';

const typedFixture = fixture as Ats34Fixture;

/**
 * Developer-only route, never linked from navigation (front/10 §11, demo/40 §4). Shows fixture
 * provenance and counters for debugging. The reset action lands once demo persistence exists
 * (T01.9) — it is intentionally absent here rather than shown as an inactive control.
 */
export default function DevFixtures() {
  const { meta } = typedFixture;
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Typography variant="h1">ATS34 fixture — developer route</Typography>
        <Alert severity="info">
          Not part of the product navigation. Shows the demo fixture provenance for debugging.
        </Alert>
        <Table size="small">
          <TableBody>
            <TableRow>
              <TableCell>Source</TableCell>
              <TableCell>{meta.source}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>SHA-256</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {meta.sourceSha256}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Converted at</TableCell>
              <TableCell>{meta.convertedAt}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Schema version</TableCell>
              <TableCell>{meta.schemaVersion}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Stations</TableCell>
              <TableCell>{meta.stations.join(', ')}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Period</TableCell>
              <TableCell>
                {meta.period.from} → {meta.period.to}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Raw observations</TableCell>
              <TableCell>{meta.counts.rawObservations}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Lookup rows</TableCell>
              <TableCell>{meta.counts.lookup}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Header rows</TableCell>
              <TableCell>{meta.counts.header}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Targets</TableCell>
              <TableCell>{meta.targetCount}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>References</TableCell>
              <TableCell>{meta.referenceCount}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Prism constants (m)</TableCell>
              <TableCell>{meta.prismConstantsM.join(', ')}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Warnings</TableCell>
              <TableCell>{meta.warnings.length === 0 ? 'none' : meta.warnings.join('; ')}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Stack>
    </Container>
  );
}
