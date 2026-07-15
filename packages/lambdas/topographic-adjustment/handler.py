"""AWS Lambda adapter for the pure BTM topographic calculation package.

This handler is stateless. The future Fastify API resolves BTM ids, the historically valid
configuration and raw_data rows before invocation; persistence remains an API/repository
responsibility. STAR*NET Ultimate stays on the dedicated Windows worker.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

from btm_topography import adjust_network, apply_distance_corrections, auto_adjust, initialise_network, prepare_scalar_observations, select_network_epochs
from btm_topography.contracts import ContractError

CONTRACT_VERSION = "btm.topographic-adjustment.v1"


def lambda_handler(event: Mapping[str, Any], _context: Any) -> dict[str, Any]:
    request_id = str(event.get("request_id", "unknown"))
    try:
        if event.get("contract_version") != CONTRACT_VERSION:
            raise ContractError(f"contract_version must be {CONTRACT_VERSION}")
        operation = str(event.get("operation"))
        payload = event.get("payload")
        if not isinstance(payload, Mapping):
            raise ContractError("payload must be an object")
        handlers: dict[str, Callable[[], Any]] = {
            "adjust": lambda: adjust_network(payload),
            "auto-adjust": lambda: auto_adjust(payload, event.get("auto_adjust", {})),
            "initialise": lambda: initialise_network(payload),
            "prepare-sights": lambda: prepare_scalar_observations(payload["sights"], payload["default_weights"]),
            "correct-distance": lambda: apply_distance_corrections(
                payload["observation"], payload["measurement"], payload["atmospheric_policy"], payload.get("environment_readings", [])
            ),
            "synchronise": lambda: select_network_epochs(
                payload["observations"], payload["station_codes"], payload["slot"],
                cycle_tolerance_minutes=float(payload["cycle_tolerance_minutes"]),
                fresh_tolerance_minutes=float(payload["fresh_tolerance_minutes"]),
                max_reused_age_minutes=float(payload["max_reused_age_minutes"]),
                max_epoch_to_slot_minutes=float(payload["max_epoch_to_slot_minutes"]),
                allow_future_minutes=float(payload.get("allow_future_minutes", 0)),
            ),
        }
        if operation not in handlers:
            raise ContractError(f"Unsupported operation {operation!r}")
        return {"statusCode": 200, "contract_version": CONTRACT_VERSION, "request_id": request_id, "result": handlers[operation]()}
    except (ContractError, KeyError, TypeError, ValueError) as error:
        return {
            "statusCode": 422,
            "contract_version": CONTRACT_VERSION,
            "request_id": request_id,
            "error": {"code": "INVALID_TOPOGRAPHIC_INPUT", "message": str(error)},
        }
    except Exception as error:  # Lambda boundary: details go to structured logs, not the client.
        print({"request_id": request_id, "error_type": type(error).__name__, "message": str(error)})
        return {
            "statusCode": 500,
            "contract_version": CONTRACT_VERSION,
            "request_id": request_id,
            "error": {"code": "TOPOGRAPHIC_ENGINE_ERROR", "message": "Topographic calculation failed"},
        }
