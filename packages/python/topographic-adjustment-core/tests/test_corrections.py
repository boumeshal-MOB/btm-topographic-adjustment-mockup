import math
import unittest

from btm_topography.corrections import apply_distance_corrections, atmospheric_ppm
from btm_topography.geometry import normalize_face
from btm_topography.weights import effective_sigmas
from btm_topography.preparation import prepare_scalar_observations


class CorrectionTests(unittest.TestCase):
    def test_prism_then_atmosphere_is_applied_once(self) -> None:
        result = apply_distance_corrections(
            {"slope_distance_m": 100.0, "epoch": "2026-07-08T00:00:00Z"},
            {"measurement_type": "prism", "required_constant_m": 0.0265, "already_applied_constant_m": 0.0},
            {"mode": "fixed-temperature-pressure", "temperature_c": 15.0, "pressure_hpa": 1015.0},
        )
        ppm = atmospheric_ppm(15.0, 1015.0)
        self.assertAlmostEqual(result["prism_delta_m"], 0.0265)
        self.assertAlmostEqual(result["final_slope_distance_m"], 100.0265 * (1 + ppm * 1e-6), places=12)

    def test_reflectorless_ignores_prism_constants(self) -> None:
        result = apply_distance_corrections(
            {"slope_distance_m": 12.3, "epoch": "2026-07-08T00:00:00Z"},
            {"measurement_type": "reflectorless", "required_constant_m": 999, "already_applied_constant_m": -999},
            {"mode": "already-applied"},
        )
        self.assertEqual(result["prism_delta_m"], 0)
        self.assertEqual(result["final_slope_distance_m"], 12.3)

    def test_unresolved_reflector_constant_is_blocking(self) -> None:
        with self.assertRaisesRegex(ValueError, "must be resolved"):
            apply_distance_corrections(
                {"slope_distance_m": 12.3, "epoch": "2026-07-08T00:00:00Z"},
                {"measurement_type": "prism", "required_constant_m": None, "already_applied_constant_m": 0},
                {"mode": "already-applied"},
            )

    def test_missing_cycle_weather_policy_is_explicit_and_provisional(self) -> None:
        result = apply_distance_corrections(
            {"slope_distance_m": 100, "epoch": "2026-07-08T00:00:00Z"},
            {"measurement_type": "reflectorless"},
            {
                "mode": "cycle-temperature-pressure",
                "tolerance_minutes": 5,
                "missing_policy": "continue-without-correction",
                "mark_provisional": True,
            },
            [],
        )
        self.assertEqual(result["atmospheric_source"], "none")
        self.assertTrue(result["provisional"])
        self.assertFalse(result["blocking"])
        self.assertEqual(result["final_slope_distance_m"], 100)

    def test_face_two_is_normalised(self) -> None:
        hz, vz, changed = normalize_face(math.radians(20), math.radians(260))
        self.assertTrue(changed)
        self.assertAlmostEqual(math.degrees(hz), 200)
        self.assertAlmostEqual(math.degrees(vz), 100)

    def test_invalid_zenith_and_distance_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "Zenith angle"):
            normalize_face(0.0, -0.1)
        with self.assertRaisesRegex(ValueError, "greater than zero"):
            apply_distance_corrections(
                {"slope_distance_m": 0, "epoch": "2026-07-08T00:00:00Z"},
                {"measurement_type": "reflectorless"},
                {"mode": "already-applied"},
            )

    def test_starnet_default_adds_constant_and_ppm_before_centering(self) -> None:
        result = effective_sigmas(
            slope_distance_m=100.0,
            zenith_rad=math.radians(90),
            direction_arcsec=1.0,
            zenith_arcsec=1.0,
            distance_mm=1.0,
            distance_ppm=2.0,
            instrument_centering_m=0.001,
            target_centering_m=0.001,
            vertical_centering_m=0.001,
        )
        self.assertAlmostEqual(result["sd"], math.sqrt(0.0012**2 + 0.001**2 + 0.001**2), places=12)
        self.assertGreater(result["hz"], math.radians(1 / 3600))
        self.assertGreater(result["vz"], math.radians(1 / 3600))

    def test_propagated_edm_mode_is_explicit(self) -> None:
        result = effective_sigmas(
            slope_distance_m=100.0,
            zenith_rad=math.radians(90),
            direction_arcsec=1.0,
            zenith_arcsec=1.0,
            distance_mm=1.0,
            distance_ppm=2.0,
            instrument_centering_m=0.0,
            target_centering_m=0.0,
            vertical_centering_m=0.0,
            edm_std_error_model="propagated",
        )
        self.assertAlmostEqual(result["sd"], math.hypot(0.001, 0.0002), places=12)

    def test_negative_weight_components_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "distance_ppm must be non-negative"):
            effective_sigmas(
                slope_distance_m=100,
                zenith_rad=math.pi / 2,
                direction_arcsec=1,
                zenith_arcsec=1,
                distance_mm=1,
                distance_ppm=-1,
                instrument_centering_m=0,
                target_centering_m=0,
                vertical_centering_m=0,
            )

    def test_sight_preparation_normalises_face_two_and_keeps_scalar_ids(self) -> None:
        rows = prepare_scalar_observations(
            [{"id": "raw-1", "station_id": "S", "target_id": "P", "hz_rad": math.radians(20), "vz_rad": math.radians(260), "slope_distance_m": 100}],
            {"direction_arcsec": 1, "zenith_arcsec": 1, "distance_mm": 1, "distance_ppm": 1},
        )
        self.assertEqual([row["id"] for row in rows], ["raw-1:hz", "raw-1:vz", "raw-1:sd"])
        self.assertAlmostEqual(math.degrees(rows[0]["value"]), 200)
        self.assertAlmostEqual(math.degrees(rows[1]["value"]), 100)
        self.assertTrue(rows[0]["face_two_normalized"])


if __name__ == "__main__":
    unittest.main()
