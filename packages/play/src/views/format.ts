/** Plain-text fragments both front ends want verbatim. */

/** `1h 30m`, `20m`, `2h` — travel time as a phrase. */
export function duration(minutes: number): string {
  if (minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
