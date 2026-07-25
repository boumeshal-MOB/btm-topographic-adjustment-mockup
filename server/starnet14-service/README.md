# BTM STAR*NET Execution Service

Small .NET 8 Windows Service exposing a bounded HTTP API around the native STAR*NET 14 launcher.

It accepts many jobs safely, creates a unique folder for each execution and limits concurrent
STAR*NET processes to the configured licensed-seat count. The default is one.

## Build and install

Download the `btm-starnet-windows-service` artifact from the latest successful PR CI run, or build
the same self-contained package with:

```powershell
.\publish-win-x64.ps1
```

For the mockup pilot, extract the downloaded artifact and run one command from its root in
PowerShell as administrator:

```powershell
.\start-pilot.ps1
```

The script installs and tests the local service when needed, downloads the official `cloudflared`
Windows client, starts a temporary outbound HTTPS tunnel and prints the two values to enter in the
mockup. It does not open an inbound VM port or store a credential in GitHub or Vercel.

Stop the temporary public URL with:

```powershell
.\stop-pilot.ps1
```

`start-pilot.ps1` uses a Cloudflare Quick Tunnel intended only for this manual prototype. A future
BTM deployment must replace it with the approved private network or a stable managed HTTPS route.

See `docs/topographic-adjustment/11-STARNET14-VM-BRIDGE.md` for the complete pilot runbook,
security boundary and Vercel configuration.
