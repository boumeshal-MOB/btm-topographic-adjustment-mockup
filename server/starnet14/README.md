# STAR*NET 14 VM bridge

This folder connects the Vercel mock-up to a licensed STAR*NET 14 Ultimate installation without
giving the browser, GitHub or Vercel any VM/FTP/RDP credential.

It is a prototype file bridge, not the final BTM service.

## Exchange folders

The worker creates:

```text
C:\BTM-StarNet\
  queue\
    incoming\    <- copy *.btmjob.json here
    processing\
    outgoing\    <- retrieve *.btmresult.json here
    processed\
    failed\
  work\           <- isolated temporary STAR*NET workspace
```

An existing FTP server may expose only `incoming` and `outgoing`. FTP credentials remain in the
FTP client/BTM infrastructure and are never stored in this repository or in the generated files.

## First validation

1. Copy this whole `server\starnet14` folder to the Windows VM.
2. Run STAR*NET 14 once with **Run as administrator** and confirm the Ultimate licence.
3. Open PowerShell in the copied folder and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Test-StarNet14.ps1
```

If STAR*NET is installed elsewhere:

```powershell
$env:STARNET14_EXE = "D:\Applications\MicroSurvey\StarNet 14\StarNet.exe"
```

4. In the mock-up, open a run and select **Download job**.
5. Copy the resulting `*.btmjob.json` file to `C:\BTM-StarNet\queue\incoming`.
6. Start `start-worker.bat`.
7. Retrieve the matching `*.btmresult.json` from `queue\outgoing`.
8. In the same run page, select **Import result**.

For one job without the watcher:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\Test-StarNet14.ps1 `
  -JobPath "C:\Path\btm-run-1.btmjob.json"
```

## Security boundary

- no inbound network listener;
- no VM, FTP, database or licence secret in a job/result;
- STAR*NET paths are discovered locally;
- only canonical `input.dat` and `project.snproj` files are accepted;
- a global Windows mutex serialises use of the STAR*NET licence;
- each job uses a random isolated workspace;
- imported results are local browser evidence and do not publish BTM measures.

Do **not** install a self-hosted GitHub Actions runner from a public repository on this VM.

## Operational notes

- The default timeout is 15 minutes and the accepted range is 30–3600 seconds.
- Add `-PreserveWorkspace` to the PowerShell worker during initial diagnosis.
- Output files are limited to 20 MB each in this prototype.
- `/NoGraphics` is requested by generated jobs. STAR*NET 14 must have the No Graphics component
  available if the VM requires it.
- Auto Adjust receives the three values from the processing configuration: maximum standardised
  residual, outliers removed per adjustment, and maximum adjustments.

The native output parser will be hardened after the first real `.lst/.pts/.err` package has been
produced by this exact STAR*NET 14 installation.
