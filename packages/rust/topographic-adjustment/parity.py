"""Build Rust-vs-Python parity and benchmark cases, run the Python reference and time it.

Writes `target/parity/cases.json`, consumed by `cargo test --release --test parity`:
- `catalogue`: the 100 synthetic datasets of `public/demo-datasets/v1`, `adjust` and `auto-adjust`;
- `fvd`: every daily epoch of the FVD_STA1 field series (94 prisms, faces I/II), one by one.

Run from the repository root (`--quick`, used by CI, keeps auto-adjust on one dataset in ten):
    PYTHONPATH=packages/python/topographic-adjustment-core/src python packages/rust/topographic-adjustment/parity.py
"""

from __future__ import annotations

import csv
import json
import math
import sys
import time
from pathlib import Path

from btm_topography import adjust_network, auto_adjust

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(__file__).resolve().parent / "target" / "parity" / "cases.json"
DEG, GON = math.pi / 180.0, math.pi / 200.0
WEIGHTS = {"direction_arcsec": 1.0, "zenith_arcsec": 1.0, "distance_mm": 1.0, "distance_ppm": 1.0}
AUTO = {"enabled": True, "max_standardized_residual": 3.0, "max_iterations": 5, "outliers_removed_per_iteration": 1}


def catalogue_payload(dataset: dict) -> dict:
    """Map one catalogue dataset to the engine payload (engine parity only, not a BTM run)."""
    observed = {o["physicalPointId"] for o in dataset["observations"]}
    initial = {c["physicalPointId"]: c for c in dataset["initialCoordinates"]}
    points = [{"id": s["id"], "role": "station", **s["coordinates"]} for s in dataset["stations"]]
    for p in dataset["physicalPoints"]:
        if p["id"] in observed:
            c = initial.get(p["id"], p["coordinates"])
            points.append({"id": p["id"], "role": p["role"], "e": c["e"], "n": c["n"], "h": c["h"]})
    constraints, seen = [], set()
    for ref in dataset["referenceConstraints"]:
        for axis, mode in ref["constraint"].items():
            key = (ref["physicalPointId"], axis)
            if mode == "free" or key in seen or ref["physicalPointId"] not in observed:
                continue
            seen.add(key)
            sigma = 1e-6 if mode == "fixed" else ref["sigmaMm"][axis] / 1000.0
            constraints.append({"point_id": ref["physicalPointId"], "component": axis, "value": ref["coordinates"][axis], "sigma": sigma})
    stations = {s["id"]: s for s in dataset["stations"]}
    bindings = {b["id"]: b for b in dataset["targetBindings"]}
    sights = [
        {
            "id": o["id"],
            "station_id": o["stationId"],
            "target_id": o["physicalPointId"],
            "hz_rad": o["hzDeg"] * DEG,
            "vz_rad": o["vzDeg"] * DEG,
            "slope_distance_m": o["storedDistanceM"],
            "instrument_height_m": stations[o["stationId"]]["instrumentHeightM"],
            "target_height_m": bindings[o["bindingId"]]["targetHeightM"],
            "direction_arcsec": o["sigmas"]["hzArcSec"],
            "zenith_arcsec": o["sigmas"]["vzArcSec"],
            "distance_mm": o["sigmas"]["distanceMm"],
            "distance_ppm": o["sigmas"]["distancePpm"],
        }
        for o in dataset["observations"]
    ]
    return {"points": points, "sights": sights, "default_weights": WEIGHTS, "constraints": constraints}


def fvd_payloads() -> list[tuple[str, dict]]:
    """FVD_STA1 daily epochs: free station, prisms initialised once, four prisms held at 1 mm."""
    source = ROOT / "test-data/source/fvd/FVD_STA1_daily_all.dat"
    rows = list(csv.reader(source.read_text(encoding="utf-8").splitlines()))
    header, data = rows[1], rows[4:]
    targets = [name.split("_")[2] for name in header if name.endswith("_F1_Hz")]

    def reading(row: list[str], target: str, face: str) -> tuple[float, float, float] | None:
        values = []
        for part in ("Hz", "Vt", "SD"):
            text = row[header.index(f"FVD_STA1_{target}_{face}_{part}")]
            value = float(text) if text not in ("", "NAN") else math.nan
            if not math.isfinite(value) or abs(value) >= 99990:
                return None
            values.append(value)
        return values[0] * GON, values[1] * GON, values[2]

    initial: dict[str, dict] = {}
    for row in data:
        for target in targets:
            r = reading(row, target, "F1")
            if target not in initial and r:
                hz, vz, sd = r
                initial[target] = {"e": sd * math.sin(vz) * math.sin(hz), "n": sd * math.sin(vz) * math.cos(hz), "h": sd * math.cos(vz)}
    held = [t for t in targets if t in initial][:4]
    cases = []
    for row in data:
        sights = []
        for target in targets:
            for face in ("F1", "F2"):
                r = reading(row, target, face)
                if r and target in initial:
                    sights.append({"id": f"{target}:{face}", "station_id": "FVD_STA1", "target_id": target, "hz_rad": r[0], "vz_rad": r[1], "slope_distance_m": r[2]})
        observed = sorted({s["target_id"] for s in sights}, key=targets.index)
        if len(observed) < 5:
            continue
        points = [{"id": "FVD_STA1", "role": "station", "e": 0.0, "n": 0.0, "h": 0.0}]
        points += [{"id": t, "role": "monitoring", **initial[t]} for t in observed]
        constraints = [{"point_id": t, "component": c, "value": initial[t][c], "sigma": 0.001} for t in held if t in observed for c in "enh"]
        cases.append((row[0], {"points": points, "sights": sights, "default_weights": WEIGHTS, "constraints": constraints}))
    return cases


def finite(value):
    """JSON has no NaN/Infinity: they become null on both sides of the comparison."""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: finite(v) for k, v in value.items()}
    if isinstance(value, list):
        return [finite(v) for v in value]
    return value


def run(name: str, group: str, operation: str, payload: dict) -> dict:
    start = time.perf_counter()
    result = adjust_network(payload) if operation == "adjust" else auto_adjust(payload, AUTO)
    elapsed = (time.perf_counter() - start) * 1000.0
    return {"name": name, "group": group, "operation": operation, "payload": payload, "auto_adjust": AUTO, "python": finite(result), "python_ms": elapsed}


def main() -> None:
    quick = "--quick" in sys.argv
    manifest = json.loads((ROOT / "public/demo-datasets/v1/manifest.json").read_text(encoding="utf-8"))
    cases = []
    for shard in sorted({d["shard"] for d in manifest["datasets"]}):
        for dataset in json.loads((ROOT / "public/demo-datasets/v1" / shard).read_text(encoding="utf-8"))["datasets"]:
            payload = catalogue_payload(dataset)
            cases.append(run(dataset["id"], "catalogue", "adjust", payload))
            if not quick or dataset["id"].endswith("0"):
                cases.append(run(dataset["id"], "catalogue", "auto-adjust", payload))
    for name, payload in fvd_payloads():
        cases.append(run(f"FVD_STA1 {name}", "fvd", "adjust", payload))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(cases), encoding="utf-8")
    for group in ("catalogue", "fvd"):
        selected = [c for c in cases if c["group"] == group]
        print(f"{group}: {len(selected)} cases, Python {sum(c['python_ms'] for c in selected):.0f} ms")


if __name__ == "__main__":
    main()
