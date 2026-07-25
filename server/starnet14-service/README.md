# BTM STAR*NET Execution Service

Small .NET 8 Windows Service exposing a bounded HTTP API around the native STAR*NET 14 launcher.

It accepts many jobs safely, creates a unique folder for each execution and limits concurrent
STAR*NET processes to the configured licensed-seat count. The default is one.

## Build and install

```powershell
.\publish-win-x64.ps1
.\install-service.ps1 -LicensedSeats 1
.\test-service.ps1
```

The installer generates the API key and prints it once. Never commit that key. The service binds
to `127.0.0.1:5080`; use an infrastructure-managed HTTPS reverse proxy for remote access.

See `docs/topographic-adjustment/11-STARNET14-VM-BRIDGE.md` for the complete pilot runbook,
security boundary and Vercel configuration.
