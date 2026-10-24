//! Rust vs Python parity and timing on the cases written by `parity.py` (run it first).
//! `cargo test --release --test parity -- --nocapture` prints the benchmark table of the README.

use btm_topographic_adjustment::{adjust_network, auto_adjust};
use serde_json::Value;
use std::time::Instant;

// Agreed margins: coordinates 1/100 mm; uncertainties 1e-4 relative; statistics 1e-6 relative.
const COORDINATE_M: f64 = 1e-5;
const ORIENTATION_RAD: f64 = 1e-7;
const RELATIVE: f64 = 1e-4;
const STATISTIC: f64 = 1e-6;

fn f(value: &Value, key: &str) -> f64 {
    value.get(key).and_then(Value::as_f64).unwrap_or(f64::NAN)
}

fn close(a: f64, b: f64, relative: f64, absolute: f64) -> bool {
    (a.is_nan() && b.is_nan()) || (a - b).abs() <= absolute + relative * a.abs().max(b.abs())
}

/// Returns the first disagreement and the largest coordinate gap of one case.
fn compare(rust: &Value, python: &Value) -> (Option<String>, f64) {
    for key in ["ok", "rank", "rank_deficiency", "degrees_of_freedom", "chi_square_status"] {
        if rust.get(key) != python.get(key) {
            return (Some(format!("{key}: rust {} / python {}", rust[key], python[key])), 0.0);
        }
    }
    // The 10 % null-space threshold is a hard cut on a continuous vector: names whose Python
    // contribution lies in the 5–20 % band may legitimately flip; any other difference fails.
    let names = |v: &Value| -> std::collections::BTreeSet<String> {
        v["deficient_unknowns"].as_array().into_iter().flatten().filter_map(|n| n.as_str().map(String::from)).collect()
    };
    let contribution = &python["rank_nullspace_contribution"];
    let max = contribution.as_object().map_or(0.0, |m| m.values().filter_map(Value::as_f64).fold(0.0, f64::max));
    let borderline = |name: &String| (0.05 * max..=0.2 * max).contains(&f(contribution, name));
    if names(rust).symmetric_difference(&names(python)).any(|name| !borderline(name)) {
        return (Some("deficient_unknowns differ".into()), 0.0);
    }
    if python["ok"] != Value::Bool(true) {
        return (None, 0.0); // non-unique solution: only the diagnosis is comparable
    }
    for key in ["weighted_ssr", "variance_factor", "chi_square_lower", "chi_square_upper"] {
        if !close(f(rust, key), f(python, key), STATISTIC, 1e-12) {
            return (Some(format!("{key}: rust {} / python {}", rust[key], python[key])), 0.0);
        }
    }
    let mut worst = 0.0_f64;
    for (r, p) in rust["points"].as_array().unwrap().iter().zip(python["points"].as_array().unwrap()) {
        for axis in ["e", "n", "h"] {
            worst = worst.max((f(r, axis) - f(p, axis)).abs());
        }
        for key in ["sigma_e", "sigma_n", "sigma_h", "ellipse_semi_major_m", "ellipse_semi_minor_m"] {
            if !close(f(r, key), f(p, key), RELATIVE, 1e-9) {
                return (Some(format!("{} {key}: rust {} / python {}", p["id"], r[key], p[key])), worst);
            }
        }
        let (major, minor) = (f(p, "ellipse_semi_major_m"), f(p, "ellipse_semi_minor_m"));
        let turn = (f(r, "ellipse_orientation_deg") - f(p, "ellipse_orientation_deg")).rem_euclid(180.0);
        if major - minor > 1e-3 * major && turn.min(180.0 - turn) > 0.01 {
            return (Some(format!("{} ellipse orientation", p["id"])), worst);
        }
    }
    if worst > COORDINATE_M {
        return (Some(format!("coordinates differ by {worst:.2e} m")), worst);
    }
    for (r, p) in rust["orientations"].as_array().unwrap().iter().zip(python["orientations"].as_array().unwrap()) {
        let turn = (f(r, "value_rad") - f(p, "value_rad")).abs();
        if turn.min(std::f64::consts::TAU - turn) > ORIENTATION_RAD {
            return (Some(format!("{} orientation", p["station_id"])), worst);
        }
    }
    for (r, p) in rust["residuals"].as_array().unwrap().iter().zip(python["residuals"].as_array().unwrap()) {
        let sigma = f(p, "sigma");
        if r["id"] != p["id"] || (f(r, "residual") - f(p, "residual")).abs() > RELATIVE * sigma || (f(r, "redundancy") - f(p, "redundancy")).abs() > RELATIVE {
            return (Some(format!("residual {}", p["id"])), worst);
        }
    }
    let excluded = |v: &Value| -> Vec<Value> {
        v["auto_adjust_attempts"].as_array().into_iter().flatten().map(|a| a["excluded_scalar_observation_id"].clone()).collect()
    };
    if excluded(rust) != excluded(python) {
        return (Some("auto-adjust exclusions differ".into()), worst);
    }
    (None, worst)
}

#[test]
fn rust_matches_python_reference() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/parity/cases.json");
    let text = std::fs::read_to_string(&path).unwrap_or_else(|_| panic!("{} missing: run parity.py first (see README)", path.display()));
    let cases: Vec<Value> = serde_json::from_str(&text).unwrap();
    let mut failures = Vec::new();
    let mut table = std::collections::BTreeMap::<(String, String), (usize, f64, f64, f64)>::new();
    for case in &cases {
        let start = Instant::now();
        let result = match case["operation"].as_str().unwrap() {
            "adjust" => adjust_network(&case["payload"]),
            _ => auto_adjust(&case["payload"], &case["auto_adjust"]),
        }
        .expect("valid payload");
        let rust_ms = start.elapsed().as_secs_f64() * 1000.0;
        // Same NaN → null projection as the Python side.
        let result: Value = serde_json::from_str(&result.to_string()).unwrap();
        let (failure, gap) = compare(&result, &case["python"]);
        if let Some(reason) = failure {
            failures.push(format!("{} [{}]: {reason}", case["name"], case["operation"]));
        }
        let row = table.entry((case["group"].as_str().unwrap().into(), case["operation"].as_str().unwrap().into())).or_default();
        *row = (row.0 + 1, row.1 + f(case, "python_ms"), row.2 + rust_ms, row.3.max(gap));
    }
    println!("\n| Jeu | Opération | Cas | Python (ms) | Rust (ms) | Gain | Écart max coordonnées |");
    println!("|---|---|---:|---:|---:|---:|---:|");
    for ((group, operation), (count, python, rust, gap)) in &table {
        println!("| {group} | {operation} | {count} | {python:.0} | {rust:.0} | ×{:.0} | {gap:.1e} m |", python / rust.max(1e-9));
    }
    println!("\n{} disagreement(s)", failures.len());
    for failure in &failures {
        println!("  - {failure}");
    }
    assert!(failures.is_empty(), "{} case(s) outside the agreed margins", failures.len());
}
