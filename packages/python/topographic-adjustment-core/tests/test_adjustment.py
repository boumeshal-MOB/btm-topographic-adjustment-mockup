import math
import unittest

from btm_topography.adjustment import adjust_network, auto_adjust


def network_payload(noises=(0.0, 0.0002, -0.0001), sd_outlier=0.0):
    target = (10.0, 20.0, 5.0)
    hz = math.atan2(target[0], target[1])
    vz = math.atan2(math.hypot(target[0], target[1]), target[2])
    sd = math.sqrt(sum(value * value for value in target))
    observations = []
    for repeat, noise in enumerate(noises):
        observations.extend(
            [
                {"id": f"o{repeat}:hz", "raw_observation_id": f"o{repeat}", "station_id": "STA", "target_id": "P", "kind": "hz", "value": hz + noise / 100.0, "sigma": math.radians(1 / 3600)},
                {"id": f"o{repeat}:vz", "raw_observation_id": f"o{repeat}", "station_id": "STA", "target_id": "P", "kind": "vz", "value": vz - noise / 100.0, "sigma": math.radians(1 / 3600)},
                {"id": f"o{repeat}:sd", "raw_observation_id": f"o{repeat}", "station_id": "STA", "target_id": "P", "kind": "sd", "value": sd + noise + (sd_outlier if repeat == 2 else 0), "sigma": 0.001},
            ]
        )
    return {
        "points": [
            {"id": "STA", "e": 0.0, "n": 0.0, "h": 0.0, "free": False, "role": "station"},
            {"id": "P", "e": 9.8, "n": 20.2, "h": 5.1, "free": True, "role": "monitoring"},
        ],
        "observations": observations,
        "options": {
            "fixed_orientations_rad": {"STA": 0.0},
            "max_iterations": 50,
            "convergence_threshold_m": 1e-10,
            "chi_square_significance": 0.05,
            "confidence_level": 0.95,
            "error_propagation": True,
        },
    }


def two_station_network_payload():
    truth = {
        "STA1": (0.0, 0.0, 0.0),
        "STA2": (40.0, 5.0, 1.0),
        "P1": (20.0, 30.0, 2.0),
        "P2": (55.0, 35.0, 4.0),
        "P3": (30.0, 65.0, 3.0),
    }
    orientations = {"STA1": 0.0, "STA2": 0.25}
    observations = []
    for station_id in orientations:
        station = truth[station_id]
        for target_id in ("P1", "P2", "P3"):
            target = truth[target_id]
            de, dn, dh = (target[index] - station[index] for index in range(3))
            horizontal = math.hypot(de, dn)
            base = {"raw_observation_id": f"{station_id}-{target_id}", "station_id": station_id, "target_id": target_id}
            observations.extend(
                [
                    {**base, "id": f"{station_id}-{target_id}:hz", "kind": "hz", "value": math.atan2(de, dn) - orientations[station_id], "sigma": math.radians(1 / 3600)},
                    {**base, "id": f"{station_id}-{target_id}:vz", "kind": "vz", "value": math.atan2(horizontal, dh), "sigma": math.radians(1 / 3600)},
                    {**base, "id": f"{station_id}-{target_id}:sd", "kind": "sd", "value": math.hypot(horizontal, dh), "sigma": 0.001},
                ]
            )
    return truth, {
        "points": [
            {"id": "STA1", "e": 0, "n": 0, "h": 0, "free": False, "role": "station"},
            {"id": "STA2", "e": 39.5, "n": 5.4, "h": 0.8, "free": True, "role": "station"},
            {"id": "P1", "e": 19.7, "n": 30.2, "h": 2.1, "free": True},
            {"id": "P2", "e": 55.2, "n": 34.8, "h": 3.9, "free": True},
            {"id": "P3", "e": 30.3, "n": 64.7, "h": 3.2, "free": True},
        ],
        "observations": observations,
        "options": {
            "fixed_orientations_rad": {"STA1": 0},
            "max_iterations": 100,
            "convergence_threshold_m": 1e-10,
        },
    }


class AdjustmentTests(unittest.TestCase):
    def test_connected_two_station_3d_network_recovers_all_unknowns(self) -> None:
        truth, payload = two_station_network_payload()
        result = adjust_network(payload)

        self.assertTrue(result["ok"], result.get("failure_reason"))
        self.assertEqual(result["rank_deficiency"], 0)
        self.assertGreater(result["degrees_of_freedom"], 0)
        by_id = {row["id"]: row for row in result["points"]}
        for point_id, expected in truth.items():
            for component, value in zip(("e", "n", "h"), expected, strict=True):
                self.assertAlmostEqual(by_id[point_id][component], value, places=6)
        orientation = next(row for row in result["orientations"] if row["station_id"] == "STA2")
        self.assertAlmostEqual(orientation["value_rad"], 0.25, places=7)

    def test_coordinates_and_covariance_are_finite(self) -> None:
        result = adjust_network(network_payload())
        self.assertTrue(result["ok"], result.get("failure_reason"))
        point = next(row for row in result["points"] if row["id"] == "P")
        self.assertAlmostEqual(point["e"], 10.0, places=3)
        self.assertAlmostEqual(point["n"], 20.0, places=3)
        self.assertAlmostEqual(point["h"], 5.0, places=3)
        self.assertGreater(point["sigma_e"], 0)
        self.assertTrue(math.isfinite(point["ellipse_semi_major_m"]))

    def test_lower_tail_failure_never_shrinks_apriori_covariance(self) -> None:
        payload = network_payload(noises=(0.0, 0.0, 0.0))
        result = adjust_network(payload)
        self.assertEqual(result["chi_square_status"], "failed")
        self.assertLess(result["variance_factor"], 1)
        self.assertEqual(result["covariance_scale_factor"], 1)

    def test_rank_deficiency_reports_nullspace_unknowns(self) -> None:
        payload = network_payload()
        payload["observations"] = [row for row in payload["observations"] if row["kind"] == "hz"]
        result = adjust_network(payload)

        self.assertFalse(result["ok"])
        self.assertGreater(result["rank_deficiency"], 0)
        self.assertTrue(result["deficient_unknowns"])
        self.assertTrue(result["rank_nullspace_contribution"])

    def test_auto_adjust_excludes_scalar_not_whole_triplet(self) -> None:
        payload = network_payload(sd_outlier=0.03)
        result = auto_adjust(
            payload,
            {"enabled": True, "max_iterations": 5, "max_standardized_residual": 3, "outliers_removed_per_iteration": 1},
        )
        self.assertTrue(result["auto_adjust_attempts"])
        excluded = result["auto_adjust_attempts"][0]["excluded_scalar_observation_id"]
        self.assertTrue(excluded.endswith(":sd"))
        self.assertNotIn(excluded.replace(":sd", ":hz"), [row["excluded_scalar_observation_id"] for row in result["auto_adjust_attempts"]])

    def test_auto_adjust_accepts_grouped_total_station_sights(self) -> None:
        payload = network_payload(sd_outlier=0.03)
        observations = payload.pop("observations")
        sights = []
        for repeat in range(3):
            components = {row["kind"]: row for row in observations if row["raw_observation_id"] == f"o{repeat}"}
            sights.append(
                {
                    "id": f"o{repeat}",
                    "station_id": "STA",
                    "target_id": "P",
                    "hz_rad": components["hz"]["value"],
                    "vz_rad": components["vz"]["value"],
                    "slope_distance_m": components["sd"]["value"],
                }
            )
        payload["sights"] = sights
        payload["default_weights"] = {
            "direction_arcsec": 1,
            "zenith_arcsec": 1,
            "distance_mm": 1,
            "distance_ppm": 0,
        }

        result = auto_adjust(
            payload,
            {"enabled": True, "max_iterations": 5, "max_standardized_residual": 3, "outliers_removed_per_iteration": 1},
        )

        self.assertTrue(result["auto_adjust_attempts"])
        self.assertTrue(result["auto_adjust_attempts"][0]["excluded_scalar_observation_id"].endswith(":sd"))


if __name__ == "__main__":
    unittest.main()
