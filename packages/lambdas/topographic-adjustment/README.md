# BTM topographic-adjustment Lambda adapter

This stateless calculation boundary is prepared for BTM. It is not used by the static Vercel
mock-up and does not run STAR*NET Ultimate.

The BTM API resolves the configuration version valid for the output slot, loads and maps
`raw_data`, then invokes this Lambda with `contract_version = btm.topographic-adjustment.v1`.
The API owns idempotent persistence to the single output variable per component and timestamp.

Build from the repository root:

```bash
docker build -f packages/lambdas/topographic-adjustment/Dockerfile .
```

For production STAR*NET, the API/worker generates `.dat` and `.prj` in an isolated temporary
folder on the licensed Windows server, parses native output, writes BTM measures and run
diagnostics transactionally, then removes the temporary folder.
