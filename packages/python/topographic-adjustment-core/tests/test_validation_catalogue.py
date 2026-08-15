import json
import math
import tempfile
import unittest
from collections import Counter
from pathlib import Path

from btm_topography.validation_catalogue import (
    PRIMARY_SCENARIO_COUNTS,
    check_catalogue,
    generate_catalogue,
)


class ValidationCatalogueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp = tempfile.TemporaryDirectory(prefix="btm-validation-tests-")
        cls.output = Path(cls.temp.name) / "v1"
        cls.manifest = generate_catalogue(cls.output)
        cls.datasets = []
        for shard in cls.manifest["shards"]:
            cls.datasets.extend(json.loads((cls.output / shard["file"]).read_text(encoding="utf-8"))["datasets"])

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temp.cleanup()

    def test_catalogue_has_exact_requested_coverage(self) -> None:
        self.assertEqual(len(self.datasets), 100)
        self.assertEqual(Counter(len(dataset["stations"]) for dataset in self.datasets), Counter({count: 20 for count in range(1, 6)}))
        self.assertEqual(Counter(dataset["scenario"]["primary"] for dataset in self.datasets), Counter(PRIMARY_SCENARIO_COUNTS))
        self.assertEqual(sum(dataset["scenario"]["secondary"] is None for dataset in self.datasets), 80)
        self.assertEqual(sum(dataset["scenario"]["secondary"] is not None for dataset in self.datasets), 20)

    def test_geometry_target_limits_and_network_identity_are_explicit(self) -> None:
        for dataset in self.datasets:
            station_count = len(dataset["stations"])
            counts = Counter(binding["stationId"] for binding in dataset["targetBindings"])
            self.assertTrue(all(count <= 30 for count in counts.values()))
            references = Counter(
                binding["stationId"] for binding in dataset["targetBindings"] if binding["role"] == "reference"
            )
            self.assertTrue(all(3 <= references[station["id"]] <= 6 for station in dataset["stations"]))
            shared_count = len(dataset["sharedPointMappings"])
            self.assertEqual(shared_count, 0) if station_count == 1 else self.assertTrue(2 <= shared_count <= 6)
            self.assertTrue(all(3 <= row["truth"]["slopeDistanceM"] <= 100 for row in dataset["observations"]))
            if station_count > 1:
                self.assertTrue(dataset["oracle"]["identityCases"]["sameRawNameButDistinctPhysicalPoints"])

    def test_clean_canonical_observation_reconstructs_truth(self) -> None:
        dataset = next(dataset for dataset in self.datasets if dataset["id"] == self.manifest["canonicalDatasetId"])
        self.assertEqual(dataset["scenario"]["primary"], "clean")
        row = next(row for row in dataset["observations"] if row["epochKind"] == "baseline")
        station = next(item for item in dataset["stations"] if item["id"] == row["stationId"])
        point = next(item for item in dataset["physicalPoints"] if item["id"] == row["physicalPointId"])
        de = point["coordinates"]["e"] - station["coordinates"]["e"]
        dn = point["coordinates"]["n"] - station["coordinates"]["n"]
        dh = point["coordinates"]["h"] - station["coordinates"]["h"] - station["instrumentHeightM"]
        expected_sd = math.sqrt(de * de + dn * dn + dh * dh)
        self.assertAlmostEqual(row["truth"]["slopeDistanceM"], expected_sd, places=6)
        expected_hz = (math.degrees(math.atan2(de, dn)) - station["orientationDeg"]) % 360
        self.assertAlmostEqual(row["truth"]["hzDeg"], expected_hz, places=6)

    def test_fault_oracles_are_physical_and_not_name_inferences(self) -> None:
        moved = [dataset for dataset in self.datasets if dataset["scenario"]["primary"] == "moved-reference"]
        for dataset in moved:
            vector = dataset["oracle"]["faultPlans"]["moved-reference"]["displacementM"]
            displacement_mm = math.sqrt(sum(vector[key] ** 2 for key in ("e", "n", "h"))) * 1000
            self.assertGreaterEqual(displacement_mm, 2.0)
            self.assertLessEqual(displacement_mm, 3.01)
        for dataset in self.datasets:
            for mapping in dataset["sharedPointMappings"]:
                members = [
                    binding
                    for binding in dataset["targetBindings"]
                    if binding["id"] in mapping["memberBindingIds"]
                ]
                self.assertEqual(len({member["physicalPointId"] for member in members}), 1)

    def test_atmosphere_face_distance_kind_and_vibration_are_diagnostic(self) -> None:
        atmosphere = next(dataset for dataset in self.datasets if dataset["scenario"]["primary"] == "atmosphere-omitted")
        atmospheric_row = next(row for row in atmosphere["observations"] if "atmosphere-omitted" in row["injectedFaults"])
        setup_by_id = {setup["id"]: setup for setup in atmosphere["measurementSetups"]}
        binding = next(binding for binding in atmosphere["targetBindings"] if binding["id"] == atmospheric_row["bindingId"])
        setup = setup_by_id[binding["measurementSetupId"]]
        required = setup["requiredConstantM"] or 0.0
        applied = setup["alreadyAppliedConstantM"] or 0.0
        delta = 0.0 if setup["measurementType"] == "reflectorless" else required - applied
        ppm = atmospheric_row["correctionTrace"]["atmosphericPpmRequired"]
        corrected = (atmospheric_row["storedDistanceM"] + delta) * (1.0 + ppm * 1e-6)
        self.assertAlmostEqual(corrected, atmospheric_row["truth"]["slopeDistanceM"], delta=0.003)

        face_dataset = next(dataset for dataset in self.datasets if dataset["scenario"]["primary"] == "face-i-ii")
        face_one = next(row for row in face_dataset["observations"] if row["epochKind"] == "incident" and row["face"] == 1 and "face-i-ii" in row["injectedFaults"])
        face_two = next(
            row
            for row in face_dataset["observations"]
            if row["epochKind"] == "incident" and row["face"] == 2 and row["bindingId"] == face_one["bindingId"]
        )
        reduced_hz_two = (face_two["hzDeg"] + 180.0) % 360.0
        reduced_vz_two = 360.0 - face_two["vzDeg"]
        hz_mean = math.degrees(
            math.atan2(
                math.sin(math.radians(face_one["hzDeg"])) + math.sin(math.radians(reduced_hz_two)),
                math.cos(math.radians(face_one["hzDeg"])) + math.cos(math.radians(reduced_hz_two)),
            )
        ) % 360.0
        self.assertAlmostEqual(hz_mean, face_one["truth"]["hzDeg"], delta=2.0 / 3600.0)
        self.assertAlmostEqual((face_one["vzDeg"] + reduced_vz_two) / 2.0, face_one["truth"]["vzDeg"], delta=2.0 / 3600.0)

        horizontal = next(dataset for dataset in self.datasets if dataset["scenario"]["primary"] == "horizontal-as-slope")
        horizontal_row = next(row for row in horizontal["observations"] if "horizontal-as-slope" in row["injectedFaults"])
        self.assertEqual(horizontal_row["storedDistanceKind"], "horizontal")

        curvature = next(dataset for dataset in self.datasets if dataset["scenario"]["primary"] == "curvature-refraction-omitted")
        curvature_row = next(row for row in curvature["observations"] if "curvature-refraction-omitted" in row["injectedFaults"])
        self.assertGreater(curvature_row["correctionTrace"]["curvatureRefractionHeightM"], 0.0002)

        vibration = next(dataset for dataset in self.datasets if dataset["scenario"]["primary"] == "station-vibration")
        vibration_rows = [row for row in vibration["observations"] if "station-vibration" in row["injectedFaults"]]
        self.assertGreaterEqual(len(vibration_rows), 3)
        self.assertEqual(len({row["stationId"] for row in vibration_rows}), 1)
        self.assertEqual({row["epochKind"] for row in vibration_rows}, {"incident"})

    def test_committed_shape_is_byte_reproducible(self) -> None:
        check_catalogue(self.output)


if __name__ == "__main__":
    unittest.main()
