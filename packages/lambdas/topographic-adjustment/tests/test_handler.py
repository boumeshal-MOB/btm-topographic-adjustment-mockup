import importlib.util
import math
import pathlib
import unittest


HANDLER_PATH = pathlib.Path(__file__).parents[1] / "handler.py"
SPEC = importlib.util.spec_from_file_location("topographic_lambda_handler", HANDLER_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class LambdaHandlerTests(unittest.TestCase):
    def invoke(self, operation, payload, **extra):
        return MODULE.lambda_handler(
            {
                "request_id": "contract-test",
                "contract_version": MODULE.CONTRACT_VERSION,
                "operation": operation,
                "payload": payload,
                **extra,
            },
            None,
        )

    def test_rejects_an_unknown_contract_version(self) -> None:
        response = MODULE.lambda_handler(
            {"request_id": "req-1", "contract_version": "old", "operation": "adjust", "payload": {}}, None
        )
        self.assertEqual(response["statusCode"], 422)
        self.assertEqual(response["request_id"], "req-1")
        self.assertEqual(response["error"]["code"], "INVALID_TOPOGRAPHIC_INPUT")

    def test_dispatches_a_distance_correction(self) -> None:
        response = MODULE.lambda_handler(
            {
                "request_id": "req-2",
                "contract_version": MODULE.CONTRACT_VERSION,
                "operation": "correct-distance",
                "payload": {
                    "observation": {"slope_distance_m": 10, "epoch": "2026-07-08T00:00:00Z"},
                    "measurement": {"measurement_type": "reflectorless"},
                    "atmospheric_policy": {"mode": "already-applied"},
                },
            },
            None,
        )
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(response["result"]["final_slope_distance_m"], 10)

    def test_prepare_sights_and_adjust_share_the_versioned_contract(self) -> None:
        target = (10.0, 20.0, 5.0)
        sight = {
            "id": "raw-1",
            "station_id": "STA",
            "target_id": "P",
            "hz_rad": math.atan2(target[0], target[1]),
            "vz_rad": math.atan2(math.hypot(target[0], target[1]), target[2]),
            "slope_distance_m": math.sqrt(sum(value * value for value in target)),
        }
        weights = {"direction_arcsec": 1, "zenith_arcsec": 1, "distance_mm": 1, "distance_ppm": 1}
        prepared = self.invoke("prepare-sights", {"sights": [sight], "default_weights": weights})
        self.assertEqual(prepared["statusCode"], 200)
        self.assertEqual([row["id"] for row in prepared["result"]], ["raw-1:hz", "raw-1:vz", "raw-1:sd"])

        adjusted = self.invoke(
            "adjust",
            {
                "points": [
                    {"id": "STA", "e": 0, "n": 0, "h": 0, "free": False},
                    {"id": "P", "e": 9.8, "n": 20.2, "h": 5.1, "free": True},
                ],
                "sights": [sight],
                "default_weights": weights,
                "options": {"fixed_orientations_rad": {"STA": 0}, "max_iterations": 50},
            },
        )
        self.assertEqual(adjusted["statusCode"], 200)
        self.assertTrue(adjusted["result"]["ok"])
        self.assertEqual(adjusted["result"]["chi_square_status"], "not-applicable")

    def test_dispatches_initialisation_and_cycle_synchronisation(self) -> None:
        initialised = self.invoke(
            "initialise",
            {
                "stations": [{"id": "STA", "fixed_coordinates": [0, 0, 0], "fixed_orientation_rad": 0}],
                "observations": [
                    {
                        "station_id": "STA",
                        "physical_point_id": "P",
                        "hz_rad": math.pi / 4,
                        "vz_rad": math.pi / 2,
                        "slope_distance_m": 10,
                        "epoch": "2026-07-08T00:00:00Z",
                    }
                ],
            },
        )
        self.assertEqual(initialised["statusCode"], 200)
        self.assertEqual(initialised["result"]["coverage"]["representative_count"], 1)

        synchronised = self.invoke(
            "synchronise",
            {
                "station_codes": ["STA"],
                "slot": "2026-07-08T00:30:00Z",
                "observations": [{"id": "o", "station_code": "STA", "target_name": "P", "epoch": "2026-07-08T00:27:00Z"}],
                "cycle_tolerance_minutes": 3,
                "fresh_tolerance_minutes": 10,
                "max_reused_age_minutes": 60,
                "max_epoch_to_slot_minutes": 60,
            },
        )
        self.assertEqual(synchronised["statusCode"], 200)
        self.assertEqual(synchronised["result"]["stations"][0]["state"], "fresh")

    def test_invalid_operation_and_input_return_stable_422(self) -> None:
        unknown = self.invoke("invented", {})
        invalid = self.invoke(
            "correct-distance",
            {
                "observation": {"slope_distance_m": -1, "epoch": "2026-07-08T00:00:00Z"},
                "measurement": {"measurement_type": "reflectorless"},
                "atmospheric_policy": {"mode": "already-applied"},
            },
        )
        self.assertEqual(unknown["statusCode"], 422)
        self.assertEqual(invalid["statusCode"], 422)
        self.assertEqual(invalid["error"]["code"], "INVALID_TOPOGRAPHIC_INPUT")


if __name__ == "__main__":
    unittest.main()
