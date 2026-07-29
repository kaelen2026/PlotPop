/**
 * The one place a duration becomes a timecode.
 *
 * `docs/design-system.md` §13 requires a single Mono treatment for timecodes; a
 * single format is the other half of that. Minutes keep counting instead of
 * rolling into an hour field, so the column never changes width.
 */
export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`${seconds} is not a duration`);
  }

  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;

  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
