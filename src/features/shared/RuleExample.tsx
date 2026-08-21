import { useId, useState, type ReactNode } from 'react';
import { Box, Collapse, Stack, Typography } from '@mui/material';

/**
 * One rule, its control, and — on demand — a worked example with real numbers.
 *
 * Every option of the Run, Output and Instruments steps answers a question the field eventually
 * asks, and none of them can be understood from its label alone: "sync tolerance" says nothing
 * about *what* is synchronised with *what*. Writing the example permanently next to each control
 * turned the screens into a wall of prose, so the example is one click away and closed by default.
 *
 * The example belongs under its own control rather than in a shared help panel: a reader who
 * wonders about *this* switch should not have to match a paragraph to a widget.
 */
export function RuleExample({
  children,
  example,
  label = 'Example',
}: {
  /** The control itself, with its own label. */
  children: ReactNode;
  /** The worked example. Keep it to concrete numbers; a second sentence is usually a symptom. */
  example: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        {children}
        <Box
          component="button"
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          aria-expanded={open}
          aria-controls={id}
          sx={{
            border: '1px solid',
            borderColor: open ? 'primary.main' : 'divider',
            color: open ? 'primary.main' : 'text.secondary',
            bgcolor: 'transparent',
            borderRadius: 1,
            cursor: 'pointer',
            font: 'inherit',
            fontSize: '0.72rem',
            lineHeight: 1.4,
            px: 0.75,
            py: 0.125,
            '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
          }}
        >
          {open ? `${label} ▴` : `${label} ▾`}
        </Box>
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Typography
          id={id}
          variant="caption"
          component="p"
          color="text.secondary"
          sx={{ mt: 0.5, pl: 1.25, borderLeft: '2px solid', borderColor: 'divider', maxWidth: 760 }}
        >
          {example}
        </Typography>
      </Collapse>
    </Box>
  );
}
