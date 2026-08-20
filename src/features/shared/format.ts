/**
 * Rendering a number that crossed a JSON boundary.
 *
 * `JSON.stringify` cannot represent `NaN` or `Infinity`: both come back as **`null`**. So a
 * diagnostic whose variance factor is `NaN` — which `adjust.ts` produces whenever the degrees of
 * freedom reach zero or the solve fails — arrives in a component as `null`, and `value.toFixed(3)`
 * throws `Cannot read properties of null (reading 'toFixed')`. That killed a whole route through the
 * error boundary, far from the cause, and the guard that was supposed to protect it tested
 * `!== undefined`, which `null` passes.
 *
 * One function therefore owns every numeric render coming from the engine or the STAR*NET service:
 * absent, null and non-finite all read as a dash. A missing number is shown as missing; it is never
 * shown as a crash and never as a zero it is not.
 */

/** The placeholder for a number that does not exist. Never an empty string: a cell must read. */
export const NO_VALUE = '—';

/** True when a value can be arithmetically used. Rejects `null`, `undefined`, `NaN`, `±Infinity`. */
export function isRealNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** `value.toFixed(decimals)`, or a dash when the number does not exist. */
export function fixed(value: number | null | undefined, decimals: number): string {
  return isRealNumber(value) ? value.toFixed(decimals) : NO_VALUE;
}

/** A metre value rendered in millimetres, or a dash. Saves repeating the `* 1000` at each call. */
export function millimetres(valueInMetres: number | null | undefined, decimals = 2): string {
  return isRealNumber(valueInMetres) ? (valueInMetres * 1000).toFixed(decimals) : NO_VALUE;
}

/** A value followed by its unit, with nothing rendered when the value does not exist. */
export function withUnit(value: number | null | undefined, decimals: number, unit: string): string {
  return isRealNumber(value) ? `${value.toFixed(decimals)} ${unit}` : NO_VALUE;
}
