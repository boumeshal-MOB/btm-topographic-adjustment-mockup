# STAR*NET 14 native launcher

This folder contains the native PowerShell launcher used by the Windows execution service.
It is an implementation detail, not a folder-watching worker.

`Invoke-BtmStarNetJob.ps1`:

- validates one canonical BTM job package;
- creates a random workspace for that run;
- writes `input.dat` and `project.snproj`;
- invokes STAR*NET 14 with `/run` or `/AUTOADJUST` and `/NoGraphics`;
- protects each configured licensed seat with a named Windows mutex;
- collects the allowlisted native output files;
- sanitises local paths;
- writes one validated result package;
- removes the workspace unless diagnostic preservation is explicitly enabled.

The installed HTTP service calls this script directly. Do not expose the script or a command shell
over the network.

## Direct VM smoke test

Run STAR*NET 14 once as administrator and confirm its Ultimate licence, then:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Test-StarNet14.ps1
```

For an existing job package:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\Test-StarNet14.ps1 `
  -JobPath "C:\Path\btm-run-1.btmjob.json"
```

The nominal installation and network instructions are in
`docs/topographic-adjustment/11-STARNET14-VM-BRIDGE.md`.
