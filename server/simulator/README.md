# Local STAR*NET execution-service simulator

This Docker image implements only the HTTP service contract, queue and deterministic fake result.
It does not install, copy, crack or emulate STAR*NET and performs no numerical adjustment.

## Start

```bash
docker compose -f server/simulator/docker-compose.yml up --build
```

Local values:

```text
Service URL: http://127.0.0.1:5080
Access key: local-simulator-key-change-me-123456
```

Run the application with `vercel dev` because `/api/starnet-service` is a Vercel Function:

```bash
STARNET_ALLOWED_SERVICE_ORIGINS=http://127.0.0.1:5080 \
STARNET_ALLOW_INSECURE_LOCALHOST=true \
npx vercel dev
```

Use the local values in the run page. Never deploy this simulator or its fixed demo key on a
public host.
