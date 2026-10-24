//! Fast Rust port of `btm_topography.adjustment` (Python reference, kept unchanged).
//!
//! Same contract, same euclidean-local model, same JSON in and out: `adjust` and `auto-adjust`
//! of the Lambda contract `btm.topographic-adjustment.v1`. What changes is only the numerics:
//! observation rows stay sparse (at most 7 non-zeros), Gauss-Newton solves the normal matrix by
//! Cholesky, and the dense SVD of the design matrix — what Python runs on every call — is only a
//! fallback when the normal matrix is singular or ill-conditioned, so rank diagnostics stay identical.

use nalgebra::{DMatrix, DVector};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::f64::consts::PI;

#[cfg(feature = "wasm")]
mod wasm;

pub const CONTRACT_VERSION: &str = "btm.topographic-adjustment.v1";
const TAU: f64 = 2.0 * PI;
const ARCSEC_TO_RAD: f64 = PI / 648_000.0;
/// Relative Cholesky pivot below which the dense SVD decides the rank, as Python does.
const PIVOT_RATIO: f64 = 1e-10;

/// A user-correctable input error (HTTP 422), the Rust counterpart of Python `ContractError`,
/// `KeyError`, `TypeError` and `ValueError` raised before the solver starts.
#[derive(Debug, Clone, PartialEq)]
pub struct ContractError(pub String);

type Result<T> = std::result::Result<T, ContractError>;

fn err<T>(message: impl Into<String>) -> Result<T> {
    Err(ContractError(message.into()))
}

// --- JSON access with Python coercion semantics (float(), str(), bool()) -------------------

fn field<'a>(object: &'a Value, key: &str) -> Result<&'a Value> {
    object.get(key).ok_or_else(|| ContractError(format!("'{key}'")))
}

fn number(value: &Value, name: &str) -> Result<f64> {
    match value {
        Value::Number(n) => n.as_f64().ok_or_else(|| ContractError(format!("{name} must be a number"))),
        Value::Bool(b) => Ok(f64::from(u8::from(*b))),
        Value::String(s) => s.trim().parse().map_err(|_| ContractError(format!("could not convert string to float: '{s}'"))),
        _ => err(format!("{name} must be a number")),
    }
}

fn number_or(object: &Value, key: &str, default: f64) -> Result<f64> {
    object.get(key).map_or(Ok(default), |value| number(value, key))
}

fn text(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => "None".into(),
        other => other.to_string(),
    }
}

fn truthy(value: Option<&Value>, default: bool) -> bool {
    match value {
        None => default,
        Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|x| x != 0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Object(o)) => !o.is_empty(),
    }
}

fn list<'a>(object: &'a Value, key: &str) -> &'a [Value] {
    object.get(key).and_then(Value::as_array).map_or(&[], Vec::as_slice)
}

// --- geometry.py / weights.py / preparation.py ----------------------------------------------

fn wrap_pi(angle: f64) -> f64 {
    (angle + PI).rem_euclid(TAU) - PI
}

fn circular_mean(angles: &[f64]) -> Result<f64> {
    let sine: f64 = angles.iter().map(|a| a.sin()).sum();
    let cosine: f64 = angles.iter().map(|a| a.cos()).sum();
    if sine.hypot(cosine) < 1e-15 {
        return err("Circular mean is undefined for antipodal directions");
    }
    Ok(sine.atan2(cosine))
}

fn normalize_face(hz: f64, vz: f64) -> Result<(f64, f64, bool)> {
    if !hz.is_finite() || !vz.is_finite() {
        return err("Horizontal and zenith angles must be finite");
    }
    if !(0.0..=TAU).contains(&vz) {
        return err("Zenith angle must be in [0, 2*pi]");
    }
    let (hz, vz) = (hz.rem_euclid(TAU), vz.rem_euclid(TAU));
    Ok(if vz > PI { ((hz + PI).rem_euclid(TAU), TAU - vz, true) } else { (hz, vz, false) })
}

struct WeightInputs {
    slope_m: f64,
    zenith_rad: f64,
    direction_arcsec: f64,
    zenith_arcsec: f64,
    distance_mm: f64,
    distance_ppm: f64,
    instrument_centering_m: f64,
    target_centering_m: f64,
    vertical_centering_m: f64,
    propagated: bool,
}

/// `weights.effective_sigmas`: STAR*NET default error propagation → (hz rad, vz rad, sd m).
fn effective_sigmas(w: &WeightInputs) -> Result<(f64, f64, f64)> {
    let all = [
        w.slope_m, w.zenith_rad, w.direction_arcsec, w.zenith_arcsec, w.distance_mm, w.distance_ppm,
        w.instrument_centering_m, w.target_centering_m, w.vertical_centering_m,
    ];
    if all.iter().any(|v| !v.is_finite()) {
        return err("Weight inputs must be finite");
    }
    if w.slope_m <= 0.0 {
        return err("Slope distance must be greater than zero");
    }
    if all[2..].iter().any(|v| *v < 0.0) {
        return err("Weight inputs must be non-negative");
    }
    let s = w.slope_m;
    let horizontal = (s * w.zenith_rad.sin()).abs().max(1e-9);
    let vertical = s * w.zenith_rad.cos();
    let centering2 = w.instrument_centering_m.powi(2) + w.target_centering_m.powi(2);
    let hz = ((w.direction_arcsec * ARCSEC_TO_RAD).powi(2) + centering2 / horizontal.powi(2)).sqrt();
    let constant = w.distance_mm / 1000.0;
    let proportional = s * w.distance_ppm * 1e-6;
    let measurement = if w.propagated { constant.hypot(proportional) } else { constant + proportional };
    let vc2 = w.vertical_centering_m.powi(2);
    let sd = (measurement.powi(2) + (horizontal / s).powi(2) * centering2 + 2.0 * (vertical / s).powi(2) * vc2).sqrt();
    let vz = ((w.zenith_arcsec * ARCSEC_TO_RAD).powi(2)
        + (vertical / s).powi(2) * centering2 / s.powi(2)
        + 2.0 * (horizontal / s).powi(2) * vc2 / s.powi(2))
    .sqrt();
    if hz <= 0.0 || vz <= 0.0 || sd <= 0.0 {
        return err("Each effective observation sigma must be greater than zero");
    }
    Ok((hz, vz, sd))
}

/// `preparation.prepare_scalar_observations`: one raw sight → hz, vz and sd scalar observations.
pub fn prepare_scalar_observations(sights: &[Value], defaults: &Value) -> Result<Vec<Value>> {
    let model = defaults.get("edm_std_error_model").map_or("additive".to_string(), text);
    if model != "additive" && model != "propagated" {
        return err("edm_std_error_model must be additive or propagated");
    }
    let mut result = Vec::with_capacity(sights.len() * 3);
    for sight in sights {
        let (hz, vz, face_two) = normalize_face(number(field(sight, "hz_rad")?, "hz_rad")?, number(field(sight, "vz_rad")?, "vz_rad")?)?;
        let slope = number(field(sight, "slope_distance_m")?, "slope_distance_m")?;
        // Python evaluates the default eagerly: a missing default is an error even when overridden.
        let own = |key: &str| -> Result<f64> {
            let default = number(field(defaults, key)?, key)?;
            number_or(sight, key, default)
        };
        let (s_hz, s_vz, s_sd) = effective_sigmas(&WeightInputs {
            slope_m: slope,
            zenith_rad: vz,
            direction_arcsec: own("direction_arcsec")?,
            zenith_arcsec: own("zenith_arcsec")?,
            distance_mm: own("distance_mm")?,
            distance_ppm: own("distance_ppm")?,
            instrument_centering_m: number_or(defaults, "instrument_centering_m", 0.0)?,
            target_centering_m: number_or(defaults, "target_centering_m", 0.0)?,
            vertical_centering_m: number_or(defaults, "vertical_centering_m", 0.0)?,
            propagated: model == "propagated",
        })?;
        let id = text(field(sight, "id")?);
        let excluded: HashSet<String> = list(sight, "excluded_components").iter().map(text).collect();
        for (kind, value, sigma) in [("hz", hz, s_hz), ("vz", vz, s_vz), ("sd", slope, s_sd)] {
            result.push(json!({
                "raw_observation_id": id,
                "station_id": text(field(sight, "station_id")?),
                "target_id": text(field(sight, "target_id")?),
                "instrument_height_m": number_or(sight, "instrument_height_m", 0.0)?,
                "target_height_m": number_or(sight, "target_height_m", 0.0)?,
                "protected": truthy(sight.get("protected"), false),
                "face_two_normalized": face_two,
                "id": format!("{id}:{kind}"),
                "kind": kind,
                "value": value,
                "sigma": sigma,
                "excluded": excluded.contains(kind),
            }));
        }
    }
    Ok(result)
}

fn with_observations(payload: &Value) -> Result<Value> {
    if payload.get("observations").is_none() && payload.get("sights").is_some() {
        let sights = field(payload, "sights")?.as_array().map_or(&[][..], Vec::as_slice);
        let observations = prepare_scalar_observations(sights, field(payload, "default_weights")?)?;
        let mut copy = payload.clone();
        copy["observations"] = Value::Array(observations);
        return Ok(copy);
    }
    Ok(payload.clone())
}

// --- adjustment.py ----------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Hz,
    Vz,
    Sd,
}

struct Observation {
    id: String,
    raw_id: String,
    station: usize,
    target: usize,
    kind: Kind,
    value: f64,
    sigma: f64,
    instrument_height: f64,
    target_height: f64,
}

struct Constraint {
    point: usize,
    component: usize,
    value: f64,
    sigma: f64,
}

struct Point {
    id: String,
    role: Value,
    enh: [f64; 3],
    index: Option<usize>,
}

/// One weighted design-matrix row: at most two points × 3 coordinates + one orientation.
#[derive(Clone, Copy)]
struct Row {
    cols: [usize; 7],
    vals: [f64; 7],
    len: usize,
}

impl Row {
    const EMPTY: Row = Row { cols: [0; 7], vals: [0.0; 7], len: 0 };

    fn add(&mut self, col: usize, val: f64) {
        if let Some(k) = self.cols[..self.len].iter().position(|c| *c == col) {
            self.vals[k] += val;
        } else {
            self.cols[self.len] = col;
            self.vals[self.len] = val;
            self.len += 1;
        }
    }

    fn add_point(&mut self, index: Option<usize>, vector: [f64; 3], sign: f64) {
        if let Some(i) = index {
            for (k, v) in vector.iter().enumerate() {
                self.add(i + k, sign * v);
            }
        }
    }

    fn entries(&self) -> impl Iterator<Item = (usize, f64)> + '_ {
        self.cols[..self.len].iter().copied().zip(self.vals[..self.len].iter().copied())
    }
}

struct Network {
    points: Vec<Point>,
    observations: Vec<Observation>,
    constraints: Vec<Constraint>,
    orientation_index: HashMap<usize, usize>,
    fixed_orientations: HashMap<String, f64>,
    hz_stations: Vec<usize>,
    names: Vec<String>,
    x0: Vec<f64>,
}

struct System {
    weighted: Vec<f64>,
    rows: Vec<Row>,
    raw: Vec<f64>,
}

impl Network {
    fn coordinates(&self, x: &[f64], point: usize) -> [f64; 3] {
        let p = &self.points[point];
        p.index.map_or(p.enh, |i| [x[i], x[i + 1], x[i + 2]])
    }

    fn orientation(&self, x: &[f64], station: usize) -> f64 {
        let id = &self.points[station].id;
        self.fixed_orientations.get(id).copied().unwrap_or_else(|| self.orientation_index.get(&station).map_or(0.0, |i| x[*i]))
    }

    fn system(&self, x: &[f64]) -> std::result::Result<System, String> {
        let total = self.observations.len() + self.constraints.len();
        let (mut weighted, mut rows, mut raw) = (Vec::with_capacity(total), Vec::with_capacity(total), Vec::with_capacity(total));
        for o in &self.observations {
            let s = self.coordinates(x, o.station);
            let t = self.coordinates(x, o.target);
            let (de, dn) = (t[0] - s[0], t[1] - s[1]);
            let dh = t[2] + o.target_height - s[2] - o.instrument_height;
            let horizontal2 = de * de + dn * dn;
            let horizontal = horizontal2.sqrt();
            let slope2 = horizontal2 + dh * dh;
            let slope = slope2.sqrt();
            if horizontal < 1e-10 || slope < 1e-10 {
                return Err(format!("Observation {} has coincident station and target", o.id));
            }
            let (si, ti) = (self.points[o.station].index, self.points[o.target].index);
            let mut row = Row::EMPTY;
            let residual = match o.kind {
                Kind::Hz => {
                    let vector = [dn / horizontal2, -de / horizontal2, 0.0];
                    row.add_point(ti, vector, 1.0);
                    row.add_point(si, vector, -1.0);
                    if let Some(slot) = self.orientation_index.get(&o.station) {
                        row.add(*slot, -1.0);
                    }
                    wrap_pi(wrap_pi(de.atan2(dn) - self.orientation(x, o.station)) - o.value)
                }
                Kind::Vz => {
                    let (d_h, d_dh) = (dh / slope2, -horizontal / slope2);
                    let vector = [d_h * de / horizontal, d_h * dn / horizontal, d_dh];
                    row.add_point(ti, vector, 1.0);
                    row.add_point(si, vector, -1.0);
                    wrap_pi(horizontal.atan2(dh) - o.value)
                }
                Kind::Sd => {
                    let vector = [de / slope, dn / slope, dh / slope];
                    row.add_point(ti, vector, 1.0);
                    row.add_point(si, vector, -1.0);
                    slope - o.value
                }
            };
            for v in &mut row.vals[..row.len] {
                *v /= o.sigma;
            }
            weighted.push(residual / o.sigma);
            rows.push(row);
            raw.push(-residual); // observed minus computed, STAR*NET report convention
        }
        for c in &self.constraints {
            let residual = self.coordinates(x, c.point)[c.component] - c.value;
            let mut row = Row::EMPTY;
            if let Some(i) = self.points[c.point].index {
                row.add(i + c.component, 1.0 / c.sigma);
            }
            weighted.push(residual / c.sigma);
            rows.push(row);
            raw.push(-residual);
        }
        Ok(System { weighted, rows, raw })
    }
}

fn normal_equations(system: &System, n: usize) -> (DMatrix<f64>, DVector<f64>) {
    let mut normal = DMatrix::<f64>::zeros(n, n);
    let mut gradient = DVector::<f64>::zeros(n);
    for (row, w) in system.rows.iter().zip(&system.weighted) {
        for (i, a) in row.entries() {
            gradient[i] += a * w;
            for (j, b) in row.entries() {
                normal[(i, j)] += a * b;
            }
        }
    }
    (normal, gradient)
}

fn dense_design(system: &System, n: usize) -> DMatrix<f64> {
    let mut design = DMatrix::<f64>::zeros(system.rows.len(), n);
    for (r, row) in system.rows.iter().enumerate() {
        for (c, v) in row.entries() {
            design[(r, c)] = v;
        }
    }
    design
}

/// Cholesky with an explicit conditioning test; `None` hands the decision to the dense SVD.
fn well_conditioned_cholesky(normal: &DMatrix<f64>) -> Option<nalgebra::Cholesky<f64, nalgebra::Dyn>> {
    let chol = normal.clone().cholesky()?;
    let l = chol.l_dirty();
    let ok = (0..normal.nrows()).all(|i| normal[(i, i)] > 0.0 && l[(i, i)].powi(2) / normal[(i, i)] > PIVOT_RATIO);
    ok.then_some(chol)
}

/// Singular values sorted descending, with matching U columns and Vᵀ rows (numpy convention).
fn sorted_svd(design: DMatrix<f64>) -> (DMatrix<f64>, Vec<f64>, DMatrix<f64>) {
    let svd = design.svd(true, true);
    let (u, vt) = (svd.u.expect("u requested"), svd.v_t.expect("v_t requested"));
    let mut order: Vec<usize> = (0..svd.singular_values.len()).collect();
    order.sort_by(|a, b| svd.singular_values[*b].total_cmp(&svd.singular_values[*a]));
    let s = order.iter().map(|k| svd.singular_values[*k]).collect();
    let u = DMatrix::from_fn(u.nrows(), order.len(), |r, c| u[(r, order[c])]);
    let vt = DMatrix::from_fn(order.len(), vt.ncols(), |r, c| vt[(order[r], c)]);
    (u, s, vt)
}

fn svd_tolerance(rows: usize, cols: usize, s: &[f64]) -> f64 {
    rows.max(cols) as f64 * f64::EPSILON * s.first().copied().unwrap_or(1.0)
}

/// ln Γ(x), Lanczos g = 7 (same coefficients as `src/domain/math/stats.ts`).
fn ln_gamma(x: f64) -> f64 {
    const C: [f64; 9] = [
        0.999_999_999_999_809_9, 676.520_368_121_885_1, -1_259.139_216_722_402_8, 771.323_428_777_653_1,
        -176.615_029_162_140_6, 12.507_343_278_686_905, -0.138_571_095_265_720_12, 9.984_369_578_019_572e-6,
        1.505_632_735_149_311_6e-7,
    ];
    if x < 0.5 {
        return (PI / (PI * x).sin()).ln() - ln_gamma(1.0 - x);
    }
    let x = x - 1.0;
    let t = x + 7.5;
    let a = C[0] + (1..9).map(|i| C[i] / (x + i as f64)).sum::<f64>();
    0.5 * TAU.ln() + (x + 0.5) * t.ln() - t + a.ln()
}

/// Regularized lower incomplete gamma P(a, x): series below a + 1, Lentz continued fraction above.
fn gamma_p(a: f64, x: f64) -> f64 {
    if x <= 0.0 {
        return 0.0;
    }
    let prefix = (-x + a * x.ln() - ln_gamma(a)).exp();
    if x < a + 1.0 {
        let (mut sum, mut term) = (1.0 / a, 1.0 / a);
        for n in 1..1000 {
            term *= x / (a + n as f64);
            sum += term;
            if term.abs() < sum.abs() * 1e-16 {
                break;
            }
        }
        return sum * prefix;
    }
    let (mut b, mut c) = (x + 1.0 - a, 1e300);
    let mut d = 1.0 / b;
    let mut h = d;
    for i in 1..1000 {
        let an = -(i as f64) * (i as f64 - a);
        b += 2.0;
        d = an * d + b;
        d = if d.abs() < 1e-300 { 1e-300 } else { d };
        c = b + an / c;
        c = if c.abs() < 1e-300 { 1e-300 } else { c };
        d = 1.0 / d;
        let delta = d * c;
        h *= delta;
        if (delta - 1.0).abs() < 1e-16 {
            break;
        }
    }
    1.0 - prefix * h
}

/// Chi-square quantile: Wilson-Hilferty start, Newton on the CDF (as `chi2Inv` in `stats.ts`).
fn chi2_ppf(p: f64, dof: f64) -> f64 {
    if dof <= 0.0 || !(0.0..1.0).contains(&p) {
        return f64::NAN;
    }
    // Abramowitz-Stegun 26.2.23 normal quantile, only a starting point.
    let tail = p.min(1.0 - p);
    let t = (-2.0 * tail.ln()).sqrt();
    let z = t - (2.515_517 + 0.802_853 * t + 0.010_328 * t * t) / (1.0 + 1.432_788 * t + 0.189_269 * t * t + 0.001_308 * t.powi(3));
    let z = if p < 0.5 { -z } else { z };
    let c = 2.0 / (9.0 * dof);
    let mut x = (dof * (1.0 - c + z * c.sqrt()).powi(3)).max(1e-3);
    let k = dof / 2.0;
    for _ in 0..60 {
        let pdf = ((k - 1.0) * x.ln() - x / 2.0 - k * 2f64.ln() - ln_gamma(k)).exp();
        if pdf < 1e-300 {
            break;
        }
        let step = (gamma_p(k, x / 2.0) - p) / pdf;
        x = (x - step).max(x / 2.0);
        if step.abs() <= 1e-12 * (1.0 + x) {
            break;
        }
    }
    x
}

fn ellipse(var_e: f64, var_n: f64, cov_en: f64) -> (f64, f64, f64) {
    let mean = (var_e + var_n) / 2.0;
    let radius = (((var_e - var_n) / 2.0).powi(2) + cov_en * cov_en).sqrt();
    let orientation = (0.5 * (2.0 * cov_en).atan2(var_n - var_e)).to_degrees().rem_euclid(180.0);
    ((mean + radius).max(0.0).sqrt(), (mean - radius).max(0.0).sqrt(), orientation)
}

fn failure(reason: &str, names: &[String], observations: usize, constraints: usize) -> Value {
    json!({
        "ok": false,
        "converged": false,
        "failure_reason": reason,
        "observation_count": observations,
        "constraint_count": constraints,
        "unknown_count": names.len(),
        "rank": 0,
        "rank_deficiency": names.len(),
        "deficient_unknowns": names,
        "degrees_of_freedom": observations as i64 + constraints as i64 - names.len() as i64,
        "chi_square_status": "not-applicable",
        "points": [],
        "orientations": [],
        "residuals": [],
        "auto_adjust_attempts": [],
    })
}

fn parse_network(payload: &Value) -> Result<Network> {
    let all_points = list(payload, "points");
    let all_observations = list(payload, "observations");
    if all_points.is_empty() {
        return err("At least one point is required");
    }
    if all_observations.is_empty() {
        return err("At least one observation is required");
    }
    for (items, collection) in [(all_points, "points"), (all_observations, "observations")] {
        let mut seen = HashSet::new();
        for item in items {
            let id = item.get("id").cloned().unwrap_or(Value::Null);
            if !seen.insert(id.to_string()) {
                return err(format!("Duplicate id {} in {collection}", id));
            }
        }
    }
    let options = payload.get("options").cloned().unwrap_or(Value::Object(Map::new()));
    let mut network = Network {
        points: Vec::with_capacity(all_points.len()),
        observations: Vec::new(),
        constraints: Vec::new(),
        orientation_index: HashMap::new(),
        fixed_orientations: HashMap::new(),
        hz_stations: Vec::new(),
        names: Vec::new(),
        x0: Vec::new(),
    };
    let mut by_id = HashMap::new();
    for point in all_points {
        let id = text(field(point, "id")?);
        let enh = [number(field(point, "e")?, "e")?, number(field(point, "n")?, "n")?, number(field(point, "h")?, "h")?];
        let index = truthy(point.get("free"), true).then(|| {
            let i = network.x0.len();
            network.x0.extend(enh);
            network.names.extend(["E", "N", "H"].map(|c| format!("{id}.{c}")));
            i
        });
        by_id.insert(id.clone(), network.points.len());
        network.points.push(Point { id, role: point.get("role").cloned().unwrap_or_else(|| json!("monitoring")), enh, index });
    }
    let lookup = |id: &Value| by_id.get(&text(id)).copied().ok_or_else(|| ContractError(format!("'{}'", text(id))));
    for o in all_observations.iter().filter(|o| !truthy(o.get("excluded"), false)) {
        let kind = match text(field(o, "kind")?).as_str() {
            "hz" => Kind::Hz,
            "vz" => Kind::Vz,
            "sd" => Kind::Sd,
            other => return err(format!("Unsupported observation kind '{other}'")),
        };
        let id = text(field(o, "id")?);
        network.observations.push(Observation {
            raw_id: o.get("raw_observation_id").map_or_else(|| id.clone(), text),
            id,
            station: lookup(field(o, "station_id")?)?,
            target: lookup(field(o, "target_id")?)?,
            kind,
            value: number(field(o, "value")?, "value")?,
            sigma: number(field(o, "sigma")?, "sigma")?,
            instrument_height: number_or(o, "instrument_height_m", 0.0)?,
            target_height: number_or(o, "target_height_m", 0.0)?,
        });
    }
    for c in list(payload, "constraints") {
        let component = match text(field(c, "component")?).as_str() {
            "e" => 0,
            "n" => 1,
            "h" => 2,
            other => return err(format!("'{other}'")),
        };
        network.constraints.push(Constraint {
            point: lookup(field(c, "point_id")?)?,
            component,
            value: number(field(c, "value")?, "value")?,
            sigma: number(field(c, "sigma")?, "sigma")?,
        });
    }
    if let Some(Value::Object(fixed)) = options.get("fixed_orientations_rad") {
        for (key, value) in fixed {
            network.fixed_orientations.insert(key.clone(), number(value, key)?);
        }
    }
    let mut stations: Vec<usize> = network.observations.iter().filter(|o| o.kind == Kind::Hz).map(|o| o.station).collect();
    stations.sort_by(|a, b| network.points[*a].id.cmp(&network.points[*b].id));
    stations.dedup();
    for &station in &stations {
        if network.fixed_orientations.contains_key(&network.points[station].id) {
            continue;
        }
        let s = network.points[station].enh;
        let candidates: Vec<f64> = network
            .observations
            .iter()
            .filter(|o| o.kind == Kind::Hz && o.station == station)
            .map(|o| {
                let t = network.points[o.target].enh;
                wrap_pi((t[0] - s[0]).atan2(t[1] - s[1]) - o.value)
            })
            .collect();
        let initial = if candidates.is_empty() { 0.0 } else { circular_mean(&candidates)? };
        network.orientation_index.insert(station, network.x0.len());
        network.x0.push(initial);
        network.names.push(format!("{}.orientation", network.points[station].id));
    }
    network.hz_stations = stations;
    Ok(network)
}

/// `adjustment.adjust_network`: one weighted least-squares adjustment.
pub fn adjust_network(payload: &Value) -> Result<Value> {
    let payload = with_observations(payload)?;
    let net = parse_network(&payload)?;
    let options = payload.get("options").cloned().unwrap_or(json!({}));
    let n = net.x0.len();
    let (m_obs, m_con) = (net.observations.len(), net.constraints.len());
    if m_obs + m_con < n {
        return Ok(failure("Under-determined system", &net.names, m_obs, m_con));
    }
    let tolerance = number_or(&options, "convergence_threshold_m", 1e-6)?;
    let max_iterations = number_or(&options, "max_iterations", 20.0)? as usize;

    // Gauss-Newton on the normal equations; minimum-norm SVD step only if they are singular.
    let mut x = DVector::from_vec(net.x0.clone());
    let (mut converged, mut iterations) = (false, 0);
    for iteration in 1..=max_iterations {
        iterations = iteration;
        let system = match net.system(x.as_slice()) {
            Ok(system) => system,
            Err(reason) => return Ok(failure(&reason, &net.names, m_obs, m_con)),
        };
        let (normal, gradient) = normal_equations(&system, n);
        let step = match well_conditioned_cholesky(&normal) {
            Some(chol) => -chol.solve(&gradient),
            None => {
                let rows = system.rows.len();
                let (u, s, vt) = sorted_svd(dense_design(&system, n));
                let tol = svd_tolerance(rows, n, &s);
                let w = DVector::from_vec(system.weighted);
                let mut step = DVector::zeros(n);
                for (k, sk) in s.iter().enumerate().filter(|(_, sk)| **sk > tol) {
                    step -= vt.row(k).transpose() * (u.column(k).dot(&w) / sk);
                }
                step
            }
        };
        x += &step;
        if !x.iter().all(|v| v.is_finite()) {
            return Ok(failure("Non-finite parameters during iteration", &net.names, m_obs, m_con));
        }
        if step.amax() <= tolerance {
            converged = true;
            break;
        }
    }
    let system = match net.system(x.as_slice()) {
        Ok(system) => system,
        Err(reason) => return Ok(failure(&reason, &net.names, m_obs, m_con)),
    };
    let rows = system.rows.len();

    // Rank, cofactor matrix and redundancy numbers.
    let (normal, _) = normal_equations(&system, n);
    let (rank, normal_inverse, hat, contribution) = match well_conditioned_cholesky(&normal) {
        Some(chol) => {
            let inverse = chol.inverse();
            let hat: Vec<f64> = system
                .rows
                .iter()
                .map(|row| row.entries().map(|(i, a)| row.entries().map(|(j, b)| a * inverse[(i, j)] * b).sum::<f64>()).sum())
                .collect();
            (n, inverse, hat, vec![0.0; n])
        }
        None => {
            let (u, s, vt) = sorted_svd(dense_design(&system, n));
            let tol = svd_tolerance(rows, n, &s);
            let rank = s.iter().filter(|v| **v > tol).count();
            let mut inverse = DMatrix::zeros(n, n);
            for k in 0..rank {
                let v = vt.row(k).transpose();
                inverse += &v * v.transpose() / (s[k] * s[k]);
            }
            let hat = (0..rows).map(|r| (0..rank).map(|k| u[(r, k)].powi(2)).sum()).collect();
            let contribution = (0..n).map(|j| (rank..n).map(|k| vt[(k, j)].abs()).fold(0.0, f64::max)).collect();
            (rank, inverse, hat, contribution)
        }
    };
    let deficient = n - rank;
    let max_contribution = contribution.iter().copied().fold(0.0, f64::max);
    let deficient_unknowns: Vec<&String> = net
        .names
        .iter()
        .zip(&contribution)
        .filter(|(_, c)| max_contribution > 0.0 && **c >= 0.1 * max_contribution)
        .map(|(name, _)| name)
        .collect();
    let rank_nullspace: Map<String, Value> =
        net.names.iter().zip(&contribution).filter(|(_, c)| **c > 0.0).map(|(name, c)| (name.clone(), json!(c))).collect();

    let dof = rows as i64 - rank as i64;
    let weighted_ssr: f64 = system.weighted.iter().map(|w| w * w).sum();
    let significance = number_or(&options, "chi_square_significance", 0.05)?;
    let (lower, upper, chi_status, variance_factor) = if dof > 0 {
        let (lower, upper) = (chi2_ppf(significance / 2.0, dof as f64), chi2_ppf(1.0 - significance / 2.0, dof as f64));
        let status = if lower <= weighted_ssr && weighted_ssr <= upper { "passed" } else { "failed" };
        (lower, upper, status, weighted_ssr / dof as f64)
    } else {
        (f64::NAN, f64::NAN, "not-applicable", f64::NAN)
    };
    // STAR*NET-compatible policy: a failed upper test may inflate uncertainty, never shrink it.
    let covariance_factor = if truthy(options.get("error_propagation"), true) && chi_status == "failed" && weighted_ssr > upper {
        variance_factor.max(1.0)
    } else {
        1.0
    };
    let covariance = normal_inverse * covariance_factor;

    let mut residuals = Vec::with_capacity(rows);
    let mut by_type: Vec<(&str, f64, f64)> = Vec::new();
    let mut observation_count = vec![0usize; net.points.len()];
    let mut worst: Option<(f64, String)> = None;
    for (index, (raw, weighted)) in system.raw.iter().zip(&system.weighted).enumerate() {
        let redundancy = (1.0 - hat[index]).clamp(0.0, 1.0);
        let (id, raw_id, station, target, kind, sigma) = if index < m_obs {
            let o = &net.observations[index];
            observation_count[o.target] += 1;
            let kind = match o.kind {
                Kind::Hz => "hz",
                Kind::Vz => "vz",
                Kind::Sd => "sd",
            };
            (o.id.clone(), o.raw_id.clone(), net.points[o.station].id.clone(), net.points[o.target].id.clone(), kind, o.sigma)
        } else {
            let c = &net.constraints[index - m_obs];
            let point = net.points[c.point].id.clone();
            (format!("constraint:{point}.{}", ["e", "n", "h"][c.component]), String::new(), String::new(), point, "constraint", c.sigma)
        };
        // STAR*NET StdRes = |v| / sigma; the Baarda normalized residual adds the redundancy.
        let standardized = raw.abs() / sigma;
        let normalized = if redundancy > 1e-12 { standardized / redundancy.sqrt() } else { f64::NAN };
        match by_type.iter_mut().find(|(k, _, _)| *k == kind) {
            Some(entry) => {
                entry.1 += weighted * weighted;
                entry.2 += redundancy;
            }
            None => by_type.push((kind, weighted * weighted, redundancy)),
        }
        if kind != "constraint" && worst.as_ref().map_or(true, |(best, _)| standardized > *best) {
            worst = Some((standardized, id.clone()));
        }
        residuals.push(json!({
            "id": id,
            "raw_observation_id": raw_id,
            "station_id": station,
            "target_id": target,
            "kind": kind,
            "residual": raw,
            "sigma": sigma,
            "standardized_residual": standardized,
            "normalized_residual": normalized,
            "redundancy": redundancy,
        }));
    }

    let confidence = number_or(&options, "confidence_level", 0.95)?;
    let ellipse_scale = (-2.0 * (1.0 - confidence).ln()).sqrt(); // sqrt(chi2.ppf(confidence, 2))
    let points: Vec<Value> = net
        .points
        .iter()
        .enumerate()
        .map(|(p, point)| {
            let [e, n, h] = net.coordinates(x.as_slice(), p);
            let (se, sn, sh, cov_en) = point.index.map_or((0.0, 0.0, 0.0, 0.0), |i| {
                let s = |k: usize| covariance[(k, k)].max(0.0).sqrt();
                (s(i), s(i + 1), s(i + 2), covariance[(i, i + 1)])
            });
            let (major, minor, orientation) = ellipse(se * se, sn * sn, cov_en);
            json!({
                "id": point.id,
                "role": point.role,
                "e": e,
                "n": n,
                "h": h,
                "sigma_e": se,
                "sigma_n": sn,
                "sigma_h": sh,
                "cov_en": cov_en,
                "ellipse_semi_major_m": major * ellipse_scale,
                "ellipse_semi_minor_m": minor * ellipse_scale,
                "ellipse_orientation_deg": orientation,
                "observation_count": observation_count[p],
            })
        })
        .collect();
    let orientations: Vec<Value> = net
        .hz_stations
        .iter()
        .map(|station| {
            let index = net.orientation_index.get(station);
            json!({
                "station_id": net.points[*station].id,
                "value_rad": wrap_pi(net.orientation(x.as_slice(), *station)),
                "sigma_rad": index.map_or(0.0, |i| covariance[(*i, *i)].max(0.0).sqrt()),
                "fixed": index.is_none(),
            })
        })
        .collect();
    let error_factor_by_type: Map<String, Value> = by_type
        .iter()
        .map(|(kind, ssr, red)| (kind.to_string(), json!(if *red > 1e-12 { (ssr / red).sqrt() } else { 0.0 })))
        .collect();

    Ok(json!({
        "model": "euclidean-local-preview-v1",
        "model_scope": "Datum scale, earth curvature and refraction remain certified STAR*NET responsibilities",
        "engine": "rust",
        "ok": converged && rank == n,
        "converged": converged,
        "message": if converged { "Gauss-Newton step below convergence threshold" } else { "Maximum number of iterations reached" },
        "iterations": iterations,
        "observation_count": m_obs,
        "constraint_count": m_con,
        "unknown_count": n,
        "rank": rank,
        "rank_deficiency": deficient,
        "deficient_unknowns": deficient_unknowns,
        "rank_nullspace_contribution": rank_nullspace,
        "degrees_of_freedom": dof,
        "weighted_ssr": weighted_ssr,
        "variance_factor": variance_factor,
        "total_error_factor": if variance_factor >= 0.0 { variance_factor.sqrt() } else { f64::NAN },
        "covariance_scale_factor": covariance_factor,
        "chi_square_status": chi_status,
        "chi_square_lower": lower,
        "chi_square_upper": upper,
        "points": points,
        "orientations": orientations,
        "residuals": residuals,
        "max_standardized_residual": worst.as_ref().map_or(0.0, |w| w.0),
        "max_standardized_residual_id": worst.map(|w| w.1),
        "error_factor_by_type": error_factor_by_type,
    }))
}

/// `adjustment.auto_adjust`: traceable scalar data snooping, raw observations never modified.
pub fn auto_adjust(payload: &Value, config: &Value) -> Result<Value> {
    let mut trial = with_observations(payload)?;
    let observations = list(&trial, "observations");
    let flagged = |key: &str| -> HashSet<String> {
        observations.iter().filter(|o| truthy(o.get(key), false)).map(|o| o.get("id").map_or("None".into(), text)).collect()
    };
    let (mut excluded, protected) = (flagged("excluded"), flagged("protected"));
    let mut attempts = Vec::new();
    let mut result = adjust_network(&trial)?;
    let failed = |result: &Value| result.get("chi_square_status").and_then(Value::as_str) == Some("failed");
    if truthy(config.get("enabled"), false) && failed(&result) {
        let threshold = number_or(config, "max_standardized_residual", 3.0)?;
        let per_iteration = (number_or(config, "outliers_removed_per_iteration", 1.0)? as i64).max(1) as usize;
        for attempt in 1..=(number_or(config, "max_iterations", 5.0)? as i64).max(0) {
            let mut candidates: Vec<(String, String, f64)> = list(&result, "residuals")
                .iter()
                .filter_map(|r| {
                    let id = text(r.get("id")?);
                    let std = r.get("standardized_residual")?.as_f64()?;
                    let kind = text(r.get("kind")?);
                    (kind != "constraint" && !protected.contains(&id) && !excluded.contains(&id) && std > threshold).then_some((id, kind, std))
                })
                .collect();
            candidates.sort_by(|a, b| b.2.total_cmp(&a.2));
            candidates.truncate(per_iteration);
            if candidates.is_empty() {
                break;
            }
            excluded.extend(candidates.iter().map(|c| c.0.clone()));
            if let Some(Value::Array(rows)) = trial.get_mut("observations") {
                for o in rows.iter_mut() {
                    let id = o.get("id").map_or("None".into(), text);
                    o["excluded"] = json!(excluded.contains(&id));
                }
            }
            result = adjust_network(&trial)?;
            for (id, kind, std) in &candidates {
                attempts.push(json!({
                    "attempt": attempt,
                    "excluded_scalar_observation_id": id,
                    "kind": kind,
                    "standardized_residual": std,
                    "chi_square_status_after": result["chi_square_status"],
                }));
            }
            if !failed(&result) {
                break;
            }
        }
    }
    result["auto_adjust_attempts"] = Value::Array(attempts);
    Ok(result)
}

/// The Lambda contract, identical to `packages/lambdas/topographic-adjustment/handler.py` for
/// `adjust` and `auto-adjust`. Shared by the AWS Lambda binary and the browser WASM build.
pub fn handle(event: &Value) -> Value {
    let request_id = event.get("request_id").map_or("unknown".to_string(), text);
    let outcome = (|| -> Result<Value> {
        if event.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION) {
            return err(format!("contract_version must be {CONTRACT_VERSION}"));
        }
        let operation = event.get("operation").map_or("None".to_string(), text);
        let payload = match event.get("payload") {
            Some(payload @ Value::Object(_)) => payload,
            _ => return err("payload must be an object"),
        };
        match operation.as_str() {
            "adjust" => adjust_network(payload),
            "auto-adjust" => auto_adjust(payload, event.get("auto_adjust").unwrap_or(&json!({}))),
            other => err(format!("Unsupported operation '{other}'")),
        }
    })();
    match outcome {
        Ok(result) => json!({"statusCode": 200, "contract_version": CONTRACT_VERSION, "request_id": request_id, "result": result}),
        Err(ContractError(message)) => json!({
            "statusCode": 422,
            "contract_version": CONTRACT_VERSION,
            "request_id": request_id,
            "error": {"code": "INVALID_TOPOGRAPHIC_INPUT", "message": message},
        }),
    }
}
