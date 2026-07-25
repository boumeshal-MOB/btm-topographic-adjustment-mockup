# BTM Topographic Adjustment Mock-up

Interactive mock-up of the future BlueTrust Monitoring `Topographic Adjustment` processing.

## Project context

Start with:

1. [PROJECT_MAP.md](PROJECT_MAP.md)
2. [CLAUDE.md](CLAUDE.md)
3. [Topographic adjustment specification](docs/topographic-adjustment/README.md)

## Delivery model

- Claude Code creates branches, commits and Pull Requests.
- The repository owner reviews and merges.
- The repository owner deploys the validated `main` branch to Vercel.
- The functional UK/FR/network baseline is already implemented; new changes must preserve its
  complete creation, run, administration, output and Analysis Lab journeys.

No production STAR*NET executable or licence occurs in Vercel. The manual-run prototype uses a
short-lived Vercel Function only as an allowlisted HTTPS gateway to the Windows execution service.
The downloadable Windows package starts the complete temporary pilot with
`START-PILOT.cmd`; no inbound VM port or FTP credential is required.

## Calculation architecture

- `packages/python/topographic-adjustment-core`: canonical, testable Python 3.12 mathematics;
- `packages/lambdas/topographic-adjustment`: stateless AWS Lambda adapter prepared for BTM;
- `src/domain`: browser-compatible TypeScript parity adapter used by the static Vercel mock-up;
- production final adjustment remains STAR*NET Ultimate behind the licensed Windows service.

Run all scientific and frontend unit tests with `npm run test:all`.

The detailed BTM/Lambda reuse contract and mathematical conventions are documented in
`docs/topographic-adjustment/09-PYTHON-ENGINE-AND-BTM-HANDOFF.md`.
