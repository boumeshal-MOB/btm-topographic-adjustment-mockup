"""Local-only FTP + STAR*NET queue simulator.

It validates the transport and UI workflow. It never contains, installs or emulates the
licensed STAR*NET executable or its numerical adjustment.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import threading
import time
from typing import Any

from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer


ROOT = Path(os.environ.get("FTP_ROOT", "/srv/ftp")).resolve()
INCOMING = ROOT / "incoming"
OUTGOING = ROOT / "outgoing"
PROCESSING = ROOT / "processing"
PROCESSED = ROOT / "processed"
FAILED = ROOT / "failed"


def env_int(name: str, default: int) -> int:
    return int(os.environ.get(name, str(default)))


def prepare_directories() -> None:
    for directory in (INCOMING, OUTGOING, PROCESSING, PROCESSED, FAILED):
        directory.mkdir(parents=True, exist_ok=True)


def safe_job(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("job must be an object")
    if value.get("kind") != "btm-starnet-job" or value.get("schemaVersion") != 1:
        raise ValueError("unsupported job")
    job_id = value.get("jobId")
    if (
        not isinstance(job_id, str)
        or not job_id.startswith("btm-")
        or len(job_id) > 84
        or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
               for character in job_id)
    ):
        raise ValueError("unsafe job id")
    files = value.get("files")
    if not isinstance(files, dict):
        raise ValueError("missing files")
    if files.get("dataFileName") != "input.dat" or files.get("projectFileName") != "project.snproj":
        raise ValueError("non-canonical filenames")
    if not isinstance(files.get("data"), str) or not isinstance(files.get("project"), str):
        raise ValueError("missing native content")
    return value


def simulated_result(job: dict[str, Any]) -> dict[str, Any]:
    started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    delay = max(0.0, min(float(os.environ.get("SIMULATED_DELAY_SECONDS", "1")), 30.0))
    time.sleep(delay)
    execution = job.get("execution", {})
    mode = execution.get("mode") if execution.get("mode") in ("run", "auto-adjust") else "run"
    observations = sum(
        1 for line in job["files"]["data"].splitlines() if line.strip().upper().startswith("DM ")
    )
    listing = "\n".join(
        (
            "BTM TRANSPORT SIMULATOR — NOT A STAR*NET NUMERICAL RESULT",
            f"Accepted observations: {observations}",
            "Solution Has Converged in 3 Iterations",
            "Chi-Square Test at 5.00% Level Passed",
            "Network Processing Completed",
            "Elapsed Time = 00:00:01",
        )
    )
    listing_bytes = listing.encode("utf-8")
    finished = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return {
        "kind": "btm-starnet-result",
        "schemaVersion": 1,
        "jobId": job["jobId"],
        "processingId": job["processingId"],
        "runId": job["runId"],
        "status": "succeeded",
        "exitCode": 0,
        "startedAt": started,
        "finishedAt": finished,
        "starNet": {
            "executableName": "STAR*NET transport simulator",
            "fileVersion": "simulator-1",
            "noGraphics": True,
            "mode": mode,
        },
        "console": {
            "stdout": listing,
            "stderr": "",
        },
        "outputFiles": [
            {
                "name": "project.lst",
                "extension": ".lst",
                "sizeBytes": len(listing_bytes),
                "sha256": hashlib.sha256(listing_bytes).hexdigest(),
                "content": listing,
            }
        ],
    }


def process_job(path: Path) -> None:
    claimed = PROCESSING / path.name
    try:
        path.replace(claimed)
    except FileNotFoundError:
        return
    try:
        job = safe_job(json.loads(claimed.read_text(encoding="utf-8")))
        result_path = OUTGOING / f"{job['jobId']}.btmresult.json"
        temporary_path = result_path.with_suffix(".uploading")
        temporary_path.write_text(
            json.dumps(simulated_result(job), indent=2) + "\n",
            encoding="utf-8",
        )
        temporary_path.replace(result_path)
        shutil.move(str(claimed), str(PROCESSED / claimed.name))
        print(f"{job['jobId']} -> simulated result", flush=True)
    except Exception as error:  # noqa: BLE001 - isolated demo boundary
        shutil.move(str(claimed), str(FAILED / claimed.name))
        (FAILED / f"{claimed.stem}.error.txt").write_text(str(error), encoding="utf-8")
        print(f"{claimed.name} -> failed: {error}", flush=True)


def worker_loop() -> None:
    while True:
        for path in sorted(INCOMING.glob("*.btmjob.json")):
            process_job(path)
        time.sleep(0.25)


def ftp_server() -> FTPServer:
    authorizer = DummyAuthorizer()
    authorizer.add_user(
        os.environ.get("FTP_USER", "btm-demo"),
        os.environ.get("FTP_PASSWORD", "btm-demo-only"),
        str(ROOT),
        perm="elradfmwMT",
    )
    handler = FTPHandler
    handler.authorizer = authorizer
    handler.masquerade_address = os.environ.get("FTP_MASQUERADE_ADDRESS") or None
    handler.passive_ports = range(
        env_int("FTP_PASSIVE_PORT_START", 30000),
        env_int("FTP_PASSIVE_PORT_END", 30009) + 1,
    )
    handler.banner = "BTM STAR*NET local transport simulator"
    return FTPServer(("0.0.0.0", env_int("FTP_PORT", 2121)), handler)


def main() -> None:
    prepare_directories()
    threading.Thread(target=worker_loop, daemon=True).start()
    server = ftp_server()
    print("Local simulator ready: FTP queue + deterministic fake result", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
