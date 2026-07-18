# UTC date and time selectors

The Topographic Adjustment wizard uses two distinct date concepts:

1. **Configuration valid from** — the activation timestamp of a configuration version. It may be any valid UTC timestamp and is edited with separate native calendar and time controls to avoid browser timezone conversion.
2. **Initialisation observation period** — a range constrained to acquisition cycles that actually exist for the first station of the selected network.

Both values are persisted as canonical ISO 8601 UTC timestamps. The activation timestamp is intentionally independent from the initialisation period (`TIME-005/006`).
