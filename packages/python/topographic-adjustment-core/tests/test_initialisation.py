import math
import unittest

from btm_topography.geometry import wrap_pi
from btm_topography.initialisation import initialise_network


def observation(station_id, station, orientation, point_id, point):
    de, dn, dh = point[0] - station[0], point[1] - station[1], point[2] - station[2]
    horizontal = math.hypot(de, dn)
    return {
        "station_id": station_id,
        "physical_point_id": point_id,
        "hz_rad": wrap_pi(math.atan2(de, dn) - orientation),
        "vz_rad": math.atan2(horizontal, dh),
        "slope_distance_m": math.hypot(horizontal, dh),
        "epoch": "2026-07-08T00:00:00Z",
    }


class InitialisationTests(unittest.TestCase):
    def test_joint_resection_uses_angles_to_resolve_network_geometry(self) -> None:
        station_1 = (0.0, 0.0, 0.0)
        station_2 = (50.0, 5.0, 1.0)
        points = {"P1": (20.0, 40.0, 2.0), "P2": (70.0, 45.0, 3.0), "P3": (45.0, 80.0, 4.0)}
        observations = []
        for point_id, point in points.items():
            observations.append(observation("STA1", station_1, 0.0, point_id, point))
            observations.append(observation("STA2", station_2, 0.3, point_id, point))
        result = initialise_network(
            {
                "stations": [
                    {"id": "STA1", "fixed_coordinates": station_1, "fixed_orientation_rad": 0.0},
                    {"id": "STA2", "approximate_coordinates": (-10.0, 20.0, 0.0)},
                ],
                "observations": observations,
                "known_points": {},
                "expected_pairs": [["STA1", key] for key in points] + [["STA2", key] for key in points],
            }
        )
        station_solution = next(row for row in result["station_solutions"] if row["station_id"] == "STA2")
        self.assertEqual(station_solution["method"], "network-resection")
        self.assertAlmostEqual(station_solution["e"], station_2[0], places=6)
        self.assertAlmostEqual(station_solution["n"], station_2[1], places=6)
        self.assertAlmostEqual(station_solution["h"], station_2[2], places=6)
        self.assertAlmostEqual(station_solution["orientation_rad"], 0.3, places=7)
        self.assertEqual(result["coverage"]["aggregation"], "component medians over the selected observation window")

    def test_approximate_station_is_resected_from_known_references_not_treated_as_fixed(self) -> None:
        station = (12.0, -5.0, 1.5)
        orientation = 0.4
        known = {"R1": (0.0, 30.0, 2.0), "R2": (40.0, 20.0, 4.0), "R3": (25.0, 60.0, -1.0)}
        result = initialise_network(
            {
                "stations": [{"id": "STA", "approximate_coordinates": (-20.0, 10.0, 0.0)}],
                "observations": [observation("STA", station, orientation, point_id, point) for point_id, point in known.items()],
                "known_points": known,
            }
        )

        solution = result["station_solutions"][0]
        self.assertEqual(solution["method"], "network-resection")
        self.assertAlmostEqual(solution["e"], station[0], places=6)
        self.assertAlmostEqual(solution["n"], station[1], places=6)
        self.assertAlmostEqual(solution["h"], station[2], places=6)
        self.assertAlmostEqual(solution["orientation_rad"], orientation, places=7)

    def test_rejects_unknown_station_and_invalid_distance(self) -> None:
        row = observation("UNKNOWN", (0.0, 0.0, 0.0), 0.0, "P1", (1.0, 1.0, 1.0))
        with self.assertRaisesRegex(ValueError, "unknown station"):
            initialise_network({"stations": [{"id": "STA"}], "observations": [row]})
        row["station_id"] = "STA"
        row["slope_distance_m"] = 0
        with self.assertRaisesRegex(ValueError, "greater than zero"):
            initialise_network({"stations": [{"id": "STA"}], "observations": [row]})


if __name__ == "__main__":
    unittest.main()
