/**
 * Plain-text fragments both front ends want verbatim.
 *
 * The bar for being here is strict: no ANSI, no layout, and the exact same
 * string wanted by the terminal and the browser. Everything else is a front
 * end's own business.
 */

/** `1h 30m`, `20m`, `2h` — travel time as a phrase. Empty for zero. */
export function duration(minutes: number): string {
  if (minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
