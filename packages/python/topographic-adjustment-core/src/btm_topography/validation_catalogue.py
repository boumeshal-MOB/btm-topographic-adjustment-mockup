"""Deterministic truth-first validation catalogue for the BTM topographic mock-up.

The catalogue is synthetic: it does not claim to be field data.  Every measurement is derived
from a known 3D geometry, then receives deterministic instrument noise and, where applicable, a
controlled fault.  The hidden oracle makes the files suitable for automated regression tests;
the mock-up must hide it until the user explicitly asks to reveal the expected answer.

Generate the committed artefacts with::

    PYTHONPATH=packages/python/topographic-adjustment-core/src \
      python -m btm_topography.validation_catalogue generate \
      --output public/demo-datasets/v1

Check byte-for-byte reproducibility with the same command and ``check`` instead of ``generate``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import tempfile
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np


SCHEMA_VERSION = 1
GENERATOR_VERSION = "1.0.0"
MASTER_SEED = 20260815
GENERATED_AT = "2026-08-15T00:00:00.000Z"
EARTH_RADIUS_M = 6_371_000.0
REFRACTION_COEFFICIENT = 0.13

PRIMARY_SCENARIO_COUNTS: dict[str, int] = {
    "clean": 12,
    "moved-reference": 14,
    "station-vibration": 14,
    "gross-hz": 6,
    "gross-vz": 6,
    "gross-sd": 6,
    "atmosphere-omitted": 12,
    "curvature-refraction-omitted": 10,
    "horizontal-as-slope": 10,
    "face-i-ii": 10,
}

FAULT_SCENARIOS = tuple(name for name in PRIMARY_SCENARIO_COUNTS if name != "clean")
EPOCH_KINDS = ("baseline", "incident", "verification")


def _round(value: float, digits: int = 9) -> float:
    """Stable JSON-friendly rounding without numpy scalar leakage."""

    return round(float(value), digits)


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _wrap_degrees(value: float) -> float:
    return value % 360.0


def _azimuth_degrees(station: dict[str, float], target: dict[str, float]) -> float:
    return _wrap_degrees(math.degrees(math.atan2(target["e"] - station["e"], target["n"] - station["n"])))


def _atmospheric_ppm(temperature_c: float, pressure_hpa: float) -> float:
    """Same explicit reference formula as the validated Python/TypeScript correction engines."""

    return 281.8 - 0.29065 * pressure_hpa / (1.0 + temperature_c / 273.15)


def _stable_json(value: Any, *, pretty: bool = False) -> bytes:
    if pretty:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    else:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    return text.encode("utf-8")


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _point(e: float, n: float, h: float) -> dict[str, float]:
    return {"e": _round(e, 6), "n": _round(n, 6), "h": _round(h, 6)}


def _scenario_schedule() -> list[str]:
    values = [name for name, count in PRIMARY_SCENARIO_COUNTS.items() for _ in range(count)]
    rng = np.random.Generator(np.random.PCG64(MASTER_SEED))
    rng.shuffle(values)
    # Dataset 41 is the stable three-station clean golden case used by parity tests.
    canonical_index = 40
    clean_index = values.index("clean")
    values[canonical_index], values[clean_index] = values[clean_index], values[canonical_index]
    return values


def _secondary_schedule(primary: list[str]) -> dict[int, str]:
    rng = np.random.Generator(np.random.PCG64(MASTER_SEED + 1))
    candidates = [index for index, scenario in enumerate(primary) if scenario != "clean"]
    selected = sorted(int(value) for value in rng.choice(candidates, size=20, replace=False))
    result: dict[int, str] = {}
    for index in selected:
        alternatives = [scenario for scenario in FAULT_SCENARIOS if scenario != primary[index]]
        result[index] = alternatives[int(rng.integers(0, len(alternatives)))]
    return result


def _station_truth(dataset_number: int, station_count: int, rng: np.random.Generator) -> list[dict[str, Any]]:
    centre_e = 1_000.0 + dataset_number * 5.0
    centre_n = 2_000.0 + dataset_number * 3.0
    centre_h = 95.0 + (dataset_number % 7) * 0.4
    radius = 0.0 if station_count == 1 else 16.0 + station_count * 1.5
    stations: list[dict[str, Any]] = []
    for index in range(station_count):
        angle = (2.0 * math.pi * index / max(station_count, 1)) + 0.17
        code = f"VAL{dataset_number:03d}_STA{index + 1}"
        coordinates = _point(
            centre_e + radius * math.sin(angle),
            centre_n + radius * math.cos(angle),
            centre_h + 0.6 * math.sin(angle * 1.7),
        )
        stations.append(
            {
                "id": f"station-{index + 1}",
                "stationCode": code,
                "coordinates": coordinates,
                "orientationDeg": _round(float(rng.uniform(0.0, 360.0)), 8),
                "instrumentHeightM": _round(float(rng.uniform(1.35, 1.75)), 4),
                "instrument": {
                    "manufacturer": "Topcon" if dataset_number % 2 == 0 else "Leica",
                    "model": "MS AX" if dataset_number % 2 == 0 else "TM50",
                    "angleSigmaArcSec": 0.5,
                    "distanceSigmaMm": 0.6,
                    "distancePpm": 1.0,
                },
            }
        )
    return stations


def _safe_local_point(
    station: dict[str, Any],
    bearing_deg: float,
    horizontal_m: float,
    height_delta_m: float,
) -> dict[str, float]:
    angle = math.radians(bearing_deg)
    source = station["coordinates"]
    return _point(
        source["e"] + horizontal_m * math.sin(angle),
        source["n"] + horizontal_m * math.cos(angle),
        source["h"] + station["instrumentHeightM"] + height_delta_m,
    )


def _build_points_and_bindings(
    dataset_number: int,
    stations: list[dict[str, Any]],
    rng: np.random.Generator,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    is_fr = dataset_number % 2 == 0
    raw_prefix = "MPO" if is_fr else "MP"
    points: list[dict[str, Any]] = []
    bindings: list[dict[str, Any]] = []
    references: list[dict[str, Any]] = []
    shared_mappings: list[dict[str, Any]] = []
    point_by_id: dict[str, dict[str, Any]] = {}

    def add_point(point_id: str, role: str, coordinates: dict[str, float]) -> dict[str, Any]:
        point = {"id": point_id, "role": role, "coordinates": coordinates}
        points.append(point)
        point_by_id[point_id] = point
        return point

    station_count = len(stations)
    shared_count = 0 if station_count == 1 else 2 + dataset_number % 5
    shared_count = min(shared_count, 6)
    centre_e = sum(station["coordinates"]["e"] for station in stations) / station_count
    centre_n = sum(station["coordinates"]["n"] for station in stations) / station_count
    centre_h = sum(station["coordinates"]["h"] for station in stations) / station_count

    for shared_index in range(shared_count):
        angle = 0.43 + shared_index * (2.0 * math.pi / shared_count)
        radius = 7.0 + 4.0 * shared_index
        point_id = f"physical-shared-{shared_index + 1}"
        add_point(
            point_id,
            "shared",
            _point(
                centre_e + radius * math.sin(angle),
                centre_n + radius * math.cos(angle),
                centre_h + 0.5 * math.sin(angle * 1.3),
            ),
        )
        member_ids: list[str] = []
        for station_index, station in enumerate(stations):
            binding_id = f"binding-{station_index + 1}-shared-{shared_index + 1}"
            member_ids.append(binding_id)
            bindings.append(
                {
                    "id": binding_id,
                    "stationId": station["id"],
                    # Deliberately different business names for the same physical point.
                    "rawTargetName": f"{raw_prefix}{700 + shared_index + station_index * 30:03d}",
                    "physicalPointId": point_id,
                    "role": "monitoring",
                    "measurementSetupId": f"setup-{station_index + 1}-{shared_index % 3}",
                    "targetHeightM": 0.0,
                }
            )
        shared_mappings.append(
            {
                "physicalPointId": point_id,
                "memberBindingIds": member_ids,
                "confirmation": "explicit-fixture-truth",
            }
        )

    for station_index, station in enumerate(stations):
        reference_count = 3 + (dataset_number + station_index) % 4
        monitoring_count = 5 + (dataset_number + station_index * 2) % 7
        for reference_index in range(reference_count):
            bearing = _wrap_degrees(24.0 + reference_index * 57.0 + station_index * 11.0)
            distance = 18.0 + reference_index * 6.0 + float(rng.uniform(-1.0, 1.0))
            point_id = f"physical-s{station_index + 1}-ref-{reference_index + 1}"
            coordinates = _safe_local_point(
                station,
                bearing,
                distance,
                float(rng.uniform(-2.0, 2.0)),
            )
            add_point(point_id, "reference", coordinates)
            binding_id = f"binding-{station_index + 1}-ref-{reference_index + 1}"
            bindings.append(
                {
                    "id": binding_id,
                    "stationId": station["id"],
                    "rawTargetName": f"REF{reference_index + 1:02d}_{station_index + 1}",
                    "physicalPointId": point_id,
                    "role": "reference",
                    "measurementSetupId": f"setup-{station_index + 1}-{reference_index % 3}",
                    "targetHeightM": 0.0,
                }
            )
            references.append(
                {
                    "physicalPointId": point_id,
                    "stationId": station["id"],
                    "coordinates": coordinates,
                    "constraint": {"e": "weak", "n": "weak", "h": "weak"},
                    "sigmaMm": {"e": 1.0, "n": 1.0, "h": 1.5},
                }
            )

        for monitoring_index in range(monitoring_count):
            bearing = _wrap_degrees(7.0 + monitoring_index * 41.0 + station_index * 19.0)
            # Include a long yet sub-100 m ray for every station so curvature/refraction cases
            # remain measurable even when a station has only five monitoring targets.
            spacing = 70.0 / max(monitoring_count - 1, 1)
            distance = 12.0 + monitoring_index * spacing + float(rng.uniform(-0.8, 0.8))
            point_id = f"physical-s{station_index + 1}-monitor-{monitoring_index + 1}"
            coordinates = _safe_local_point(
                station,
                bearing,
                distance,
                float(rng.uniform(-2.5, 2.5)),
            )
            add_point(point_id, "monitoring", coordinates)
            binding_id = f"binding-{station_index + 1}-monitor-{monitoring_index + 1}"
            # All stations intentionally contain one identical raw name which represents a
            # different physical point.  It protects against name-based auto-linking.
            raw_name = f"{raw_prefix}001" if monitoring_index == 0 else f"{raw_prefix}{100 + monitoring_index:03d}_{station_index + 1}"
            bindings.append(
                {
                    "id": binding_id,
                    "stationId": station["id"],
                    "rawTargetName": raw_name,
                    "physicalPointId": point_id,
                    "role": "monitoring",
                    "measurementSetupId": f"setup-{station_index + 1}-{monitoring_index % 3}",
                    "targetHeightM": 0.0,
                }
            )

    return points, bindings, references, shared_mappings


def _measurement_setups(dataset_number: int, stations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    is_fr = dataset_number % 2 == 0
    setups: list[dict[str, Any]] = []
    for station_index, station in enumerate(stations):
        base = f"setup-{station_index + 1}"
        if is_fr:
            setups.extend(
                [
                    {
                        "id": f"{base}-0",
                        "stationId": station["id"],
                        "measurementType": "prism",
                        "edmMode": "fine-prism",
                        "reflector": "MPO FR",
                        "requiredConstantM": 0.0255,
                        "alreadyAppliedConstantM": 0.0255,
                    },
                    {
                        "id": f"{base}-1",
                        "stationId": station["id"],
                        "measurementType": "reflective-sheet",
                        "edmMode": "fine-sheet",
                        "reflector": "reflective sheet",
                        "requiredConstantM": 0.0,
                        "alreadyAppliedConstantM": 0.0,
                    },
                    {
                        "id": f"{base}-2",
                        "stationId": station["id"],
                        "measurementType": "reflectorless",
                        "edmMode": "reflectorless",
                        "reflector": None,
                        "requiredConstantM": None,
                        "alreadyAppliedConstantM": None,
                    },
                ]
            )
        else:
            constants = (0.0, 0.0089, 0.0265)
            reflector_names = ("Leica circular prism", "Ibar", "Leica mini prism")
            for setup_index, (constant, reflector) in enumerate(zip(constants, reflector_names, strict=True)):
                setups.append(
                    {
                        "id": f"{base}-{setup_index}",
                        "stationId": station["id"],
                        "measurementType": "prism",
                        "edmMode": "fine-prism",
                        "reflector": reflector,
                        # Supplied UK convention: the stored raw Sd used 0 mm and BTM applies
                        # the per-target lookup constant once.
                        "requiredConstantM": constant,
                        "alreadyAppliedConstantM": 0.0,
                    }
                )
    return setups


def _distance_between(station: dict[str, Any], point: dict[str, Any], target_height_m: float) -> tuple[float, float, float]:
    s = station["coordinates"]
    p = point["coordinates"]
    de = p["e"] - s["e"]
    dn = p["n"] - s["n"]
    dh = p["h"] + target_height_m - (s["h"] + station["instrumentHeightM"])
    horizontal = math.hypot(de, dn)
    slope = math.hypot(horizontal, dh)
    return horizontal, slope, dh


def _fault_plan(
    scenarios: list[str],
    stations: list[dict[str, Any]],
    points: list[dict[str, Any]],
    bindings: list[dict[str, Any]],
    references: list[dict[str, Any]],
    rng: np.random.Generator,
) -> dict[str, Any]:
    plans: dict[str, Any] = {}
    station_by_id = {station["id"]: station for station in stations}
    point_by_id = {point["id"]: point for point in points}
    for scenario in scenarios:
        if scenario == "clean":
            continue
        if scenario == "moved-reference":
            reference = references[int(rng.integers(0, len(references)))]
            angle = float(rng.uniform(0.0, 2.0 * math.pi))
            magnitude_m = float(rng.uniform(0.002, 0.0030000001))
            elevation = float(rng.uniform(-0.25, 0.25))
            plans[scenario] = {
                "physicalPointId": reference["physicalPointId"],
                "displacementM": {
                    "e": _round(magnitude_m * math.cos(elevation) * math.sin(angle), 9),
                    "n": _round(magnitude_m * math.cos(elevation) * math.cos(angle), 9),
                    "h": _round(magnitude_m * math.sin(elevation), 9),
                },
            }
        elif scenario == "station-vibration":
            station = stations[int(rng.integers(0, len(stations)))]
            station_bindings = [binding for binding in bindings if binding["stationId"] == station["id"]]
            first = max(0, len(station_bindings) // 3)
            affected = station_bindings[first : first + max(3, len(station_bindings) // 3)]
            plans[scenario] = {
                "stationId": station["id"],
                "affectedBindingIds": [binding["id"] for binding in affected],
                "translationM": {
                    "e": _round(float(rng.uniform(-0.004, 0.004)), 9),
                    "n": _round(float(rng.uniform(-0.004, 0.004)), 9),
                    "h": _round(float(rng.uniform(-0.002, 0.002)), 9),
                },
                "orientationArcSec": _round(float(rng.choice([-1.0, 1.0]) * rng.uniform(3.0, 8.0)), 6),
            }
        elif scenario in {"gross-hz", "gross-vz", "gross-sd", "horizontal-as-slope", "curvature-refraction-omitted"}:
            if scenario == "curvature-refraction-omitted":
                monitoring = [binding for binding in bindings if "-monitor-" in binding["id"]]
                binding = max(
                    monitoring,
                    key=lambda item: _distance_between(
                        station_by_id[item["stationId"]],
                        point_by_id[item["physicalPointId"]],
                        item["targetHeightM"],
                    )[1],
                )
            else:
                binding = bindings[int(rng.integers(0, len(bindings)))]
            payload: dict[str, Any] = {"bindingId": binding["id"]}
            if scenario == "gross-hz":
                payload["errorArcSec"] = _round(float(rng.choice([-1.0, 1.0]) * rng.uniform(25.0, 75.0)), 6)
            elif scenario == "gross-vz":
                payload["errorArcSec"] = _round(float(rng.choice([-1.0, 1.0]) * rng.uniform(25.0, 75.0)), 6)
            elif scenario == "gross-sd":
                payload["errorM"] = _round(float(rng.choice([-1.0, 1.0]) * rng.uniform(0.012, 0.035)), 9)
            plans[scenario] = payload
        elif scenario == "atmosphere-omitted":
            station = stations[int(rng.integers(0, len(stations)))]
            plans[scenario] = {"stationId": station["id"]}
        elif scenario == "face-i-ii":
            station = stations[int(rng.integers(0, len(stations)))]
            plans[scenario] = {
                "stationId": station["id"],
                "horizontalCollimationArcSec": _round(float(rng.uniform(0.8, 2.0)), 6),
                "verticalIndexArcSec": _round(float(rng.uniform(0.8, 2.0)), 6),
            }
        else:  # pragma: no cover - protected by the scenario constant
            raise AssertionError(f"Unhandled scenario {scenario}")
    return plans


def _build_observations(
    dataset_number: int,
    primary_scenario: str,
    secondary_scenario: str | None,
    stations: list[dict[str, Any]],
    points: list[dict[str, Any]],
    bindings: list[dict[str, Any]],
    setups: list[dict[str, Any]],
    references: list[dict[str, Any]],
    rng: np.random.Generator,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    scenarios = [primary_scenario] + ([secondary_scenario] if secondary_scenario else [])
    plans = _fault_plan(scenarios, stations, points, bindings, references, rng)
    point_by_id = {point["id"]: point for point in points}
    station_by_id = {station["id"]: station for station in stations}
    setup_by_id = {setup["id"]: setup for setup in setups}
    observations: list[dict[str, Any]] = []
    environments: list[dict[str, Any]] = []
    start = datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=dataset_number - 1)
    epoch_times = [start + timedelta(minutes=30 * index) for index in range(3)]
    record_number = 1

    moved_plan = plans.get("moved-reference")
    vibration_plan = plans.get("station-vibration")
    atmosphere_plan = plans.get("atmosphere-omitted")
    face_plan = plans.get("face-i-ii")

    for epoch_index, epoch_kind in enumerate(EPOCH_KINDS):
        epoch = epoch_times[epoch_index]
        for station_index, station in enumerate(stations):
            temperature_c = 8.0 + (dataset_number % 17) * 0.7 + epoch_index * 1.8 + station_index * 0.3
            pressure_hpa = 985.0 + (dataset_number % 19) * 1.7 - station_index * 0.8
            environments.append(
                {
                    "stationId": station["id"],
                    "epoch": _iso(epoch - timedelta(minutes=2)),
                    "temperatureC": _round(temperature_c, 3),
                    "pressureHPa": _round(pressure_hpa, 3),
                    "valid": True,
                }
            )
            station_bindings = [binding for binding in bindings if binding["stationId"] == station["id"]]
            for sight_index, binding in enumerate(station_bindings):
                point = point_by_id[binding["physicalPointId"]]
                setup = setup_by_id[binding["measurementSetupId"]]
                target_coordinates = dict(point["coordinates"])
                effective_station = {**station, "coordinates": dict(station["coordinates"])}
                effective_orientation = station["orientationDeg"]
                applied_faults: list[str] = []

                # A moved reference remains displaced in both incident and verification epochs;
                # recovery means changing/freeing the constraint, not inventing a return to place.
                if moved_plan and epoch_kind != "baseline" and point["id"] == moved_plan["physicalPointId"]:
                    for component in ("e", "n", "h"):
                        target_coordinates[component] += moved_plan["displacementM"][component]
                    applied_faults.append("moved-reference")

                # Vibration is a time-correlated burst across contiguous sights, never a fake
                # displacement of the reference itself.
                if (
                    vibration_plan
                    and epoch_kind == "incident"
                    and station["id"] == vibration_plan["stationId"]
                    and binding["id"] in vibration_plan["affectedBindingIds"]
                ):
                    for component in ("e", "n", "h"):
                        effective_station["coordinates"][component] += vibration_plan["translationM"][component]
                    effective_orientation += vibration_plan["orientationArcSec"] / 3600.0
                    applied_faults.append("station-vibration")

                effective_point = {**point, "coordinates": target_coordinates}
                horizontal_m, exact_slope_m, delta_h_m = _distance_between(
                    effective_station, effective_point, binding["targetHeightM"]
                )
                exact_hz_deg = _wrap_degrees(
                    _azimuth_degrees(effective_station["coordinates"], target_coordinates) - effective_orientation
                )
                exact_vz_deg = math.degrees(math.atan2(horizontal_m, delta_h_m))

                curvature_plan = plans.get("curvature-refraction-omitted")
                curvature_correction_m = 0.0
                if (
                    curvature_plan
                    and epoch_kind == "incident"
                    and binding["id"] == curvature_plan["bindingId"]
                ):
                    curvature_correction_m = (1.0 - REFRACTION_COEFFICIENT) * horizontal_m**2 / (2.0 * EARTH_RADIUS_M)
                    exact_vz_deg = math.degrees(math.atan2(horizontal_m, delta_h_m - curvature_correction_m))
                    applied_faults.append("curvature-refraction-omitted")

                hz_noise_arcsec = float(rng.normal(0.0, 0.35))
                vz_noise_arcsec = float(rng.normal(0.0, 0.35))
                sd_noise_m = float(rng.normal(0.0, 0.00045 + exact_slope_m * 0.7e-6))
                measured_hz = exact_hz_deg + hz_noise_arcsec / 3600.0
                measured_vz = exact_vz_deg + vz_noise_arcsec / 3600.0
                desired_corrected_distance = exact_slope_m + sd_noise_m
                stored_distance_kind = "slope"

                horizontal_plan = plans.get("horizontal-as-slope")
                if horizontal_plan and epoch_kind == "incident" and binding["id"] == horizontal_plan["bindingId"]:
                    desired_corrected_distance = horizontal_m + sd_noise_m
                    stored_distance_kind = "horizontal"
                    applied_faults.append("horizontal-as-slope")

                gross_hz_plan = plans.get("gross-hz")
                if gross_hz_plan and epoch_kind == "incident" and binding["id"] == gross_hz_plan["bindingId"]:
                    measured_hz += gross_hz_plan["errorArcSec"] / 3600.0
                    applied_faults.append("gross-hz")
                gross_vz_plan = plans.get("gross-vz")
                if gross_vz_plan and epoch_kind == "incident" and binding["id"] == gross_vz_plan["bindingId"]:
                    measured_vz += gross_vz_plan["errorArcSec"] / 3600.0
                    applied_faults.append("gross-vz")

                required = setup["requiredConstantM"] or 0.0
                already_applied = setup["alreadyAppliedConstantM"] or 0.0
                prism_delta_m = required - already_applied if setup["measurementType"] != "reflectorless" else 0.0
                ppm = 0.0
                atmosphere_required = (
                    atmosphere_plan
                    and epoch_kind == "incident"
                    and station["id"] == atmosphere_plan["stationId"]
                )
                if atmosphere_required:
                    ppm = _atmospheric_ppm(temperature_c, pressure_hpa)
                    applied_faults.append("atmosphere-omitted")
                atmospheric_scale = 1.0 + ppm * 1e-6
                stored_distance_m = desired_corrected_distance / atmospheric_scale - prism_delta_m

                gross_sd_plan = plans.get("gross-sd")
                if gross_sd_plan and epoch_kind == "incident" and binding["id"] == gross_sd_plan["bindingId"]:
                    stored_distance_m += gross_sd_plan["errorM"]
                    applied_faults.append("gross-sd")

                sight_time = epoch + timedelta(seconds=8 * sight_index + station_index)
                face_rows: list[tuple[int, float, float]] = [(1, measured_hz, measured_vz)]
                if face_plan and epoch_kind == "incident" and station["id"] == face_plan["stationId"]:
                    collimation = face_plan["horizontalCollimationArcSec"] / 3600.0
                    index_error = face_plan["verticalIndexArcSec"] / 3600.0
                    # Reduced Face I = truth + c/i; reduced Face II = truth - c/i.  Circular
                    # reduction therefore recovers the direction without a 0/360 discontinuity.
                    face_rows = [
                        (1, measured_hz + collimation, measured_vz + index_error),
                        (2, _wrap_degrees(measured_hz + 180.0 - collimation), 360.0 - measured_vz + index_error),
                    ]
                    if "face-i-ii" not in applied_faults:
                        applied_faults.append("face-i-ii")

                for face, hz_deg, vz_deg in face_rows:
                    observations.append(
                        {
                            "id": f"obs-{record_number:06d}",
                            "stationId": station["id"],
                            "bindingId": binding["id"],
                            "physicalPointId": point["id"],
                            "epoch": _iso(sight_time + timedelta(seconds=(face - 1) * 2)),
                            "epochKind": epoch_kind,
                            "face": face,
                            "hzDeg": _round(_wrap_degrees(hz_deg), 9),
                            "vzDeg": _round(vz_deg, 9),
                            "storedDistanceM": _round(stored_distance_m, 9),
                            "storedDistanceKind": stored_distance_kind,
                            "sigmas": {"hzArcSec": 0.5, "vzArcSec": 0.5, "distanceMm": 0.6, "distancePpm": 1.0},
                            "correctionTrace": {
                                "prismDeltaM": _round(prism_delta_m, 9),
                                "atmosphericPpmRequired": _round(ppm, 9),
                                "curvatureRefractionHeightM": _round(curvature_correction_m, 9),
                            },
                            "truth": {
                                "hzDeg": _round(_wrap_degrees(exact_hz_deg), 9),
                                "vzDeg": _round(exact_vz_deg, 9),
                                "slopeDistanceM": _round(exact_slope_m, 9),
                                "horizontalDistanceM": _round(horizontal_m, 9),
                            },
                            "injectedFaults": sorted(set(applied_faults)),
                        }
                    )
                    record_number += 1

    configured_atmosphere = [
        {
            "stationId": station["id"],
            "mode": "none" if atmosphere_plan and station["id"] == atmosphere_plan["stationId"] else "already-applied",
            "missingPolicy": "continue-without-correction",
            "formulaId": "standard-dry-air-ppm-v1",
        }
        for station in stations
    ]
    oracle = {
        "faultPlans": plans,
        "expectedPrimaryScenario": primary_scenario,
        "expectedSecondaryScenario": secondary_scenario,
        "recommendedAnalysisActions": _recommended_actions(scenarios, plans),
        "disclosure": "Synthetic truth. Hide this oracle in blind mode.",
    }
    return observations, environments, {"atmosphericPolicies": configured_atmosphere, "oracle": oracle}


def _recommended_actions(scenarios: list[str], plans: dict[str, Any]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for scenario in scenarios:
        plan = plans.get(scenario, {})
        if scenario == "clean":
            actions.append({"scenario": scenario, "action": "retain-validated-configuration"})
        elif scenario == "moved-reference":
            actions.append({"scenario": scenario, "action": "free-or-update-reference", "target": plan.get("physicalPointId")})
        elif scenario == "station-vibration":
            actions.append({"scenario": scenario, "action": "exclude-correlated-sight-burst", "stationId": plan.get("stationId")})
        elif scenario.startswith("gross-"):
            actions.append({"scenario": scenario, "action": "review-and-exclude-measurement-component", "bindingId": plan.get("bindingId")})
        elif scenario == "atmosphere-omitted":
            actions.append({"scenario": scenario, "action": "apply-cycle-temperature-pressure", "stationId": plan.get("stationId")})
        elif scenario == "curvature-refraction-omitted":
            actions.append({"scenario": scenario, "action": "enable-curvature-refraction", "bindingId": plan.get("bindingId")})
        elif scenario == "horizontal-as-slope":
            actions.append({"scenario": scenario, "action": "declare-horizontal-distance", "bindingId": plan.get("bindingId")})
        elif scenario == "face-i-ii":
            actions.append({"scenario": scenario, "action": "reduce-face-pair", "stationId": plan.get("stationId")})
    return actions


def generate_dataset(dataset_number: int, primary_scenario: str, secondary_scenario: str | None) -> dict[str, Any]:
    rng = np.random.Generator(np.random.PCG64(MASTER_SEED + dataset_number * 104_729))
    station_count = (dataset_number - 1) // 20 + 1
    stations = _station_truth(dataset_number, station_count, rng)
    points, bindings, references, shared_mappings = _build_points_and_bindings(dataset_number, stations, rng)
    setups = _measurement_setups(dataset_number, stations)
    observations, environments, generated = _build_observations(
        dataset_number,
        primary_scenario,
        secondary_scenario,
        stations,
        points,
        bindings,
        setups,
        references,
        rng,
    )
    initial_coordinates = []
    for point in points:
        initial_coordinates.append(
            {
                "physicalPointId": point["id"],
                "e": _round(point["coordinates"]["e"] + float(rng.normal(0.0, 0.004)), 6),
                "n": _round(point["coordinates"]["n"] + float(rng.normal(0.0, 0.004)), 6),
                "h": _round(point["coordinates"]["h"] + float(rng.normal(0.0, 0.003)), 6),
                "source": "deterministic-approximation",
            }
        )
    raw_name_groups: dict[str, list[dict[str, str]]] = {}
    for binding in bindings:
        raw_name_groups.setdefault(binding["rawTargetName"], []).append(
            {"bindingId": binding["id"], "physicalPointId": binding["physicalPointId"], "stationId": binding["stationId"]}
        )
    distinct_homonyms = [
        {"rawTargetName": name, "members": members}
        for name, members in raw_name_groups.items()
        if len({member["physicalPointId"] for member in members}) > 1
    ]
    dataset_id = f"BTM-VAL-{dataset_number:03d}"
    dataset = {
        "schemaVersion": SCHEMA_VERSION,
        "id": dataset_id,
        "seed": MASTER_SEED + dataset_number * 104_729,
        "title": f"{station_count}-station {primary_scenario} validation case",
        "classification": "synthetic-truth-first-validation-data",
        "template": "FR" if dataset_number % 2 == 0 else "UK",
        "scenario": {
            "primary": primary_scenario,
            "secondary": secondary_scenario,
            "isCombined": secondary_scenario is not None,
        },
        "conventions": {
            "coordinates": "E/N/H metres",
            "horizontalAngles": "degrees from North, clockwise",
            "verticalAngles": "zenith degrees",
            "distance": "stored value explicitly declares slope or horizontal",
            "faceReduction": "Face II: Hz-180 degrees and Vz=360-Vz before circular mean",
        },
        "epochs": [
            {"kind": kind, "timestamp": _iso(datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=dataset_number - 1, minutes=30 * index))}
            for index, kind in enumerate(EPOCH_KINDS)
        ],
        "stations": stations,
        "physicalPoints": points,
        "targetBindings": bindings,
        "sharedPointMappings": shared_mappings,
        "referenceConstraints": references,
        "measurementSetups": setups,
        "initialCoordinates": initial_coordinates,
        "environmentReadings": environments,
        "configuredPolicies": generated["atmosphericPolicies"],
        "observations": observations,
        "oracle": {
            **generated["oracle"],
            "physicalPointTruth": [{"id": point["id"], **point["coordinates"]} for point in points],
            "identityCases": {
                "confirmedSharedPoints": shared_mappings,
                "sameRawNameButDistinctPhysicalPoints": distinct_homonyms,
            },
        },
    }
    _validate_dataset(dataset)
    return dataset


def _validate_dataset(dataset: dict[str, Any]) -> None:
    stations = dataset["stations"]
    points = {point["id"]: point for point in dataset["physicalPoints"]}
    bindings = dataset["targetBindings"]
    station_ids = {station["id"] for station in stations}
    binding_ids = {binding["id"] for binding in bindings}
    assert len(stations) in range(1, 6)
    assert len(binding_ids) == len(bindings)
    assert all(binding["stationId"] in station_ids for binding in bindings)
    assert all(binding["physicalPointId"] in points for binding in bindings)

    per_station = Counter(binding["stationId"] for binding in bindings)
    assert all(count <= 30 for count in per_station.values())
    reference_per_station = Counter(binding["stationId"] for binding in bindings if binding["role"] == "reference")
    assert all(3 <= reference_per_station[station_id] <= 6 for station_id in station_ids)

    shared = dataset["sharedPointMappings"]
    if len(stations) == 1:
        assert len(shared) == 0
    else:
        assert 2 <= len(shared) <= 6
        assert all(len(mapping["memberBindingIds"]) == len(stations) for mapping in shared)

    observation_ids: set[str] = set()
    for observation in dataset["observations"]:
        assert observation["id"] not in observation_ids
        observation_ids.add(observation["id"])
        assert observation["bindingId"] in binding_ids
        truth = observation["truth"]
        assert 3.0 <= truth["slopeDistanceM"] <= 100.0
        assert math.isfinite(observation["hzDeg"])
        assert math.isfinite(observation["vzDeg"])
        assert observation["storedDistanceM"] > 0.0

    for scenario in (dataset["scenario"]["primary"], dataset["scenario"]["secondary"]):
        if scenario == "moved-reference":
            displacement = dataset["oracle"]["faultPlans"][scenario]["displacementM"]
            displacement_mm = math.sqrt(sum(displacement[component] ** 2 for component in ("e", "n", "h"))) * 1000.0
            assert 2.0 <= displacement_mm <= 3.01


def _dataset_summary(dataset: dict[str, Any], shard: str) -> dict[str, Any]:
    per_station = Counter(binding["stationId"] for binding in dataset["targetBindings"])
    return {
        "id": dataset["id"],
        "title": dataset["title"],
        "shard": shard,
        "template": dataset["template"],
        "stationCount": len(dataset["stations"]),
        "targetCountByStation": dict(sorted(per_station.items())),
        "referenceCount": len(dataset["referenceConstraints"]),
        "sharedPointCount": len(dataset["sharedPointMappings"]),
        "observationCount": len(dataset["observations"]),
        "primaryScenario": dataset["scenario"]["primary"],
        "secondaryScenario": dataset["scenario"]["secondary"],
        "combined": dataset["scenario"]["isCombined"],
    }


def _schema_document() -> dict[str, Any]:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://btm.example/schemas/topographic-validation-dataset-v1.json",
        "title": "BTM topographic validation dataset",
        "type": "object",
        "required": [
            "schemaVersion",
            "id",
            "scenario",
            "stations",
            "physicalPoints",
            "targetBindings",
            "observations",
            "oracle",
        ],
        "properties": {
            "schemaVersion": {"const": SCHEMA_VERSION},
            "id": {"type": "string", "pattern": "^BTM-VAL-[0-9]{3}$"},
            "stations": {"type": "array", "minItems": 1, "maxItems": 5},
            "targetBindings": {"type": "array", "minItems": 1},
            "observations": {"type": "array", "minItems": 1},
            "oracle": {"type": "object"},
        },
        "additionalProperties": True,
    }


def generate_catalogue(output: Path) -> dict[str, Any]:
    primary = _scenario_schedule()
    secondary = _secondary_schedule(primary)
    datasets = [generate_dataset(index + 1, scenario, secondary.get(index)) for index, scenario in enumerate(primary)]
    if output.exists():
        shutil.rmtree(output)
    (output / "shards").mkdir(parents=True, exist_ok=True)

    summaries: list[dict[str, Any]] = []
    shard_records: list[dict[str, Any]] = []
    for start in range(0, 100, 10):
        end = start + 10
        filename = f"shards/validation-{start + 1:03d}-{end:03d}.json"
        payload = _stable_json({"schemaVersion": SCHEMA_VERSION, "datasets": datasets[start:end]})
        (output / filename).write_bytes(payload)
        shard_records.append(
            {
                "file": filename,
                "firstDatasetId": datasets[start]["id"],
                "lastDatasetId": datasets[end - 1]["id"],
                "datasetCount": 10,
                "bytes": len(payload),
                "sha256": _sha256(payload),
            }
        )
        summaries.extend(_dataset_summary(dataset, filename) for dataset in datasets[start:end])

    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "generatorVersion": GENERATOR_VERSION,
        "masterSeed": MASTER_SEED,
        "generatedAt": GENERATED_AT,
        "classification": "synthetic truth-first validation data; not field measurements",
        "canonicalDatasetId": "BTM-VAL-041",
        "datasetCount": 100,
        "distribution": {
            "stationCount": {str(count): 20 for count in range(1, 6)},
            "primaryScenario": PRIMARY_SCENARIO_COUNTS,
            "isolated": 80,
            "combined": 20,
        },
        "scenarioDefinitions": {
            "clean": "Coherent observations with deterministic instrument noise only.",
            "moved-reference": "One constrained reference physically moves by 2–3 mm.",
            "station-vibration": "A transient station displacement/orientation burst affects contiguous sights.",
            "gross-hz": "One horizontal direction contains a controlled gross error.",
            "gross-vz": "One zenith angle contains a controlled gross error.",
            "gross-sd": "One stored distance contains a controlled gross error.",
            "atmosphere-omitted": "Raw distance requires cycle T/P correction but the configured policy omits it.",
            "curvature-refraction-omitted": "One long sight carries the realistic vertical curvature/refraction effect.",
            "horizontal-as-slope": "A horizontal distance is deliberately interpreted as a slope distance.",
            "face-i-ii": "Face I/II pairs require normalization and circular reduction.",
        },
        "shards": shard_records,
        "datasets": summaries,
    }
    _validate_catalogue(manifest, datasets)
    (output / "manifest.json").write_bytes(_stable_json(manifest, pretty=True))
    (output / "schema.json").write_bytes(_stable_json(_schema_document(), pretty=True))
    return manifest


def _validate_catalogue(manifest: dict[str, Any], datasets: list[dict[str, Any]]) -> None:
    assert len(datasets) == 100
    assert len({dataset["id"] for dataset in datasets}) == 100
    assert Counter(len(dataset["stations"]) for dataset in datasets) == Counter({count: 20 for count in range(1, 6)})
    assert Counter(dataset["scenario"]["primary"] for dataset in datasets) == Counter(PRIMARY_SCENARIO_COUNTS)
    assert sum(dataset["scenario"]["secondary"] is None for dataset in datasets) == 80
    assert sum(dataset["scenario"]["secondary"] is not None for dataset in datasets) == 20
    assert next(dataset for dataset in datasets if dataset["id"] == manifest["canonicalDatasetId"])["scenario"]["primary"] == "clean"


def check_catalogue(output: Path) -> None:
    if not output.exists():
        raise SystemExit(f"Catalogue does not exist: {output}")
    with tempfile.TemporaryDirectory(prefix="btm-validation-check-") as temp_dir:
        regenerated = Path(temp_dir) / "v1"
        generate_catalogue(regenerated)
        expected_files = sorted(path.relative_to(output) for path in output.rglob("*") if path.is_file())
        actual_files = sorted(path.relative_to(regenerated) for path in regenerated.rglob("*") if path.is_file())
        if expected_files != actual_files:
            raise SystemExit(f"Catalogue file set differs: committed={expected_files}, generated={actual_files}")
        mismatches = [relative for relative in expected_files if (output / relative).read_bytes() != (regenerated / relative).read_bytes()]
        if mismatches:
            raise SystemExit(f"Catalogue is not reproducible; mismatched files: {mismatches}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("generate", "check"))
    parser.add_argument("--output", type=Path, default=Path("public/demo-datasets/v1"))
    args = parser.parse_args(argv)
    if args.command == "generate":
        manifest = generate_catalogue(args.output)
        print(f"Generated {manifest['datasetCount']} deterministic datasets in {args.output}")
    else:
        check_catalogue(args.output)
        print(f"Catalogue is byte-for-byte reproducible: {args.output}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
