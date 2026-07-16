import unittest

from btm_topography.synchronisation import select_network_epochs


class SynchronisationTests(unittest.TestCase):
    def test_station_cycle_is_selected_before_targets(self) -> None:
        observations = [
            {"id": "old-a", "station_code": "STA1", "target_name": "A", "epoch": "2026-07-08T09:30:00Z"},
            {"id": "old-b", "station_code": "STA1", "target_name": "B", "epoch": "2026-07-08T09:31:00Z"},
            {"id": "new-a", "station_code": "STA1", "target_name": "A", "epoch": "2026-07-08T09:58:00Z"},
            {"id": "new-b", "station_code": "STA1", "target_name": "B", "epoch": "2026-07-08T09:59:00Z"},
        ]
        result = select_network_epochs(
            observations,
            ["STA1"],
            "2026-07-08T10:00:00Z",
            cycle_tolerance_minutes=3,
            fresh_tolerance_minutes=10,
            max_reused_age_minutes=60,
            max_epoch_to_slot_minutes=60,
        )
        self.assertEqual({row["id"] for row in result["selected_observations"]}, {"new-a", "new-b"})
        self.assertEqual(result["stations"][0]["state"], "fresh")
        self.assertEqual(result["stations"][0]["availability_percent"], 100)

    def test_future_epoch_is_not_selected_unless_policy_allows_it(self) -> None:
        observations = [{"id": "future", "station_code": "STA1", "target_name": "A", "epoch": "2026-07-08T10:02:00Z"}]
        result = select_network_epochs(
            observations,
            ["STA1"],
            "2026-07-08T10:00:00Z",
            cycle_tolerance_minutes=3,
            fresh_tolerance_minutes=10,
            max_reused_age_minutes=60,
            max_epoch_to_slot_minutes=60,
        )
        self.assertEqual(result["stations"][0]["state"], "missing")

    def test_naive_timestamps_and_negative_tolerances_are_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "timezone"):
            select_network_epochs(
                [], ["STA1"], "2026-07-08T10:00:00",
                cycle_tolerance_minutes=3, fresh_tolerance_minutes=10,
                max_reused_age_minutes=60, max_epoch_to_slot_minutes=60,
            )
        with self.assertRaisesRegex(ValueError, "non-negative"):
            select_network_epochs(
                [], ["STA1"], "2026-07-08T10:00:00Z",
                cycle_tolerance_minutes=-1, fresh_tolerance_minutes=10,
                max_reused_age_minutes=60, max_epoch_to_slot_minutes=60,
            )


if __name__ == "__main__":
    unittest.main()
