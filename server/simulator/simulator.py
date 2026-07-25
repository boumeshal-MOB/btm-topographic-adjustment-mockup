"""Local HTTP simulator for the BTM STAR*NET execution service contract.

This validates the transport and UI workflow only. It never installs or emulates the
licensed STAR*NET executable and does not return a numerical adjustment.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from queue import Full, Queue
import re
import threading
import time
from typing import Any
from urllib.parse import unquote, urlparse


API_KEY = os.environ.get(
    "BTM_STARNET_API_KEY",
    "local-simulator-key-change-me-123456",
)
PORT = int(os.environ.get("PORT", "5080"))
DELAY_SECONDS = max(0.0, min(float(os.environ.get("SIMULATED_DELAY_SECONDS", "1")), 30.0))
SAFE_JOB_ID = re.compile(r"^btm-[A-Za-z0-9._-]{1,80}$")
MAX_REQUEST_BYTES = 4_000_000
RUNS: dict[str, "Run"] = {}
RUNS_LOCK = threading.Lock()
QUEUE: Queue[str] = Queue(maxsize=500)


@dataclass
class Run:
    job: dict[str, Any]
    status: str = "queued"
    result: dict[str, Any] | None = None
    error: str | None = None


def validate_job(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("job must be an object")
    if value.get("kind") != "btm-starnet-job" or value.get("schemaVersion") != 1:
        raise ValueError("unsupported job")
    job_id = value.get("jobId")
    if not isinstance(job_id, str) or not SAFE_JOB_ID.fullmatch(job_id):
        raise ValueError("unsafe job id")
    files = value.get("files")
    execution = value.get("execution")
    if not isinstance(files, dict) or not isinstance(execution, dict):
        raise ValueError("missing files or execution")
    if files.get("dataFileName") != "input.dat" or files.get("projectFileName") != "project.snproj":
        raise ValueError("non-canonical filenames")
    if not isinstance(files.get("data"), str) or not isinstance(files.get("project"), str):
        raise ValueError("missing native content")
    return value


def simulated_result(job: dict[str, Any]) -> dict[str, Any]:
    started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    time.sleep(DELAY_SECONDS)
    execution = job.get("execution", {})
    mode = execution.get("mode") if execution.get("mode") in ("run", "auto-adjust") else "run"
    observations = sum(
        1 for line in job["files"]["data"].splitlines() if line.strip().upper().startswith("DM ")
    )
    listing = "\n".join(
        (
            "BTM HTTP SERVICE SIMULATOR — NOT A STAR*NET NUMERICAL RESULT",
            f"Accepted observations: {observations}",
            "Solution Has Converged in 3 Iterations",
            "Chi-Square Test at 5.00% Level Passed",
            "Network Processing Completed",
            "Elapsed Time = 00:00:01",
        )
    )
    content = listing.encode("utf-8")
    return {
        "kind": "btm-starnet-result",
        "schemaVersion": 1,
        "jobId": job["jobId"],
        "processingId": job["processingId"],
        "runId": job["runId"],
        "status": "succeeded",
        "exitCode": 0,
        "startedAt": started,
        "finishedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "starNet": {
            "executableName": "STAR*NET service contract simulator",
            "fileVersion": "simulator-2",
            "noGraphics": True,
            "mode": mode,
        },
        "console": {"stdout": listing, "stderr": ""},
        "outputFiles": [
            {
                "name": "project.lst",
                "extension": ".lst",
                "sizeBytes": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
                "content": listing,
            }
        ],
    }


def execution_loop() -> None:
    while True:
        job_id = QUEUE.get()
        try:
            with RUNS_LOCK:
                run = RUNS[job_id]
                run.status = "running"
            result = simulated_result(run.job)
            with RUNS_LOCK:
                run.result = result
                run.status = "completed"
        except Exception as error:  # noqa: BLE001 - isolated simulator boundary
            with RUNS_LOCK:
                run.status = "failed"
                run.error = str(error)
        finally:
            QUEUE.task_done()


class Handler(BaseHTTPRequestHandler):
    server_version = "BTMStarNetSimulator/2"

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}", flush=True)

    def send_json(self, status: int, value: Any) -> None:
        body = json.dumps(value, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def authorised(self) -> bool:
        return self.headers.get("X-BTM-StarNet-Key", "") == API_KEY

    def require_authorisation(self) -> bool:
        if self.authorised():
            return True
        self.send_json(401, {"code": "UNAUTHORIZED", "message": "A valid service key is required."})
        return False

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        path = urlparse(self.path).path
        if path in ("/health", "/v1/health"):
            if path.startswith("/v1/") and not self.require_authorisation():
                return
            self.send_json(
                200,
                {
                    "status": "ok",
                    "starNetAvailable": True,
                    "invocationScriptAvailable": True,
                    "maximumConcurrentExecutions": 1,
                },
            )
            return
        match = re.fullmatch(r"/v1/runs/([^/]+)/result", path)
        if not match:
            self.send_json(404, {"code": "NOT_FOUND", "message": "Route not found."})
            return
        if not self.require_authorisation():
            return
        job_id = unquote(match.group(1))
        if not SAFE_JOB_ID.fullmatch(job_id):
            self.send_json(400, {"code": "INVALID_REQUEST", "message": "Invalid jobId."})
            return
        with RUNS_LOCK:
            run = RUNS.get(job_id)
            if run is None:
                self.send_json(404, {"code": "RUN_NOT_FOUND", "message": "Run not found."})
            elif run.result is not None:
                self.send_json(200, run.result)
            elif run.status == "failed":
                self.send_json(500, {"status": "failed", "error": run.error})
            else:
                self.send_json(202, {"jobId": job_id, "status": run.status})

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        if urlparse(self.path).path != "/v1/runs":
            self.send_json(404, {"code": "NOT_FOUND", "message": "Route not found."})
            return
        if not self.require_authorisation():
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > MAX_REQUEST_BYTES:
                raise ValueError("invalid request size")
            job = validate_job(json.loads(self.rfile.read(length)))
            job_id = job["jobId"]
            with RUNS_LOCK:
                if job_id in RUNS:
                    run = RUNS[job_id]
                    self.send_json(202, {"jobId": job_id, "status": run.status})
                    return
                RUNS[job_id] = Run(job=job)
            try:
                QUEUE.put_nowait(job_id)
            except Full:
                with RUNS_LOCK:
                    RUNS.pop(job_id, None)
                self.send_json(503, {"code": "QUEUE_FULL", "message": "Execution queue is full."})
                return
            self.send_json(202, {"jobId": job_id, "status": "queued"})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"code": "INVALID_REQUEST", "message": str(error)})


def main() -> None:
    threading.Thread(target=execution_loop, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Local STAR*NET HTTP contract simulator ready on http://127.0.0.1:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
