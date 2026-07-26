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

For the mockup pilot, extract the downloaded artifact and double-click:

```text
START-PILOT.cmd
```

Accept the Windows administrator prompt. The launcher removes the downloaded-file marker only from
the extracted package and applies `ExecutionPolicy Bypass` only to that PowerShell process. It does
not change the machine or user execution policy.

The launcher installs the local service when needed and updates an older pilot installation from
the downloaded package while preserving its settings and key. For a STAR*NET **Typical**
installation, it temporarily runs the execution host in the current interactive Windows user
session so STAR*NET sees the same licence and user profile as a working `StarNet.exe project.prj
/RUN` BAT command. It then starts a temporary outbound HTTPS tunnel and prints the two values to
enter in the mockup. It does not open an inbound VM port or store a credential in GitHub or Vercel.

Select **Standard CLI** in the mock-up for a STAR*NET Typical installation. Select
**No Graphics CLI** only when STAR*NET was installed with the corresponding Custom option.

Stop the temporary public URL with:

```text
STOP-PILOT.cmd
```

Stopping the pilot also stops its interactive execution host and restores the installed Windows
service when it was running before the pilot. The permanent service remains the production-shaped
component; its Windows account will need the STAR*NET licence/profile required by the chosen
installation mode.

`start-pilot.ps1` uses a Cloudflare Quick Tunnel intended only for this manual prototype. A future
BTM deployment must replace it with the approved private network or a stable managed HTTPS route.

See `docs/topographic-adjustment/11-STARNET14-VM-BRIDGE.md` for the complete pilot runbook,
security boundary and Vercel configuration.
