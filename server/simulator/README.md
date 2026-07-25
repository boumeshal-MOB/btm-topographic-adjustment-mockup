# Local STAR*NET VM transport simulator

This Docker image simulates only the **server boundary**:

- an FTP queue with `incoming` and `outgoing` folders;
- a worker that claims one `.btmjob.json`;
- a deterministic `.btmresult.json` returned to the mock-up.

It does not install, copy, crack or emulate STAR*NET and does not perform a numerical adjustment.
The licensed executable remains installed natively on the Windows 11 VM.

## Start

```bash
docker compose -f server/simulator/docker-compose.yml up --build
```

Local demo connection:

```text
Host: 127.0.0.1
Port: 2121
Security: Plain FTP — local demo only
Username: btm-demo
Password: btm-demo-only
Incoming: /incoming
Outgoing: /outgoing
```

Run the web application with `vercel dev`, not `npm run dev`, because the FTP gateway is a Vercel
Function:

```bash
STARNET_ALLOWED_FTP_HOSTS=127.0.0.1,localhost \
STARNET_ALLOWED_FTP_PORTS=2121 \
npx vercel dev
```

Never deploy this simulator or its fixed demo credentials on a public host. It is for local
transport and UI tests only.
