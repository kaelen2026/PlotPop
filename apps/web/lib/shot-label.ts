import type { PrototypeShot } from "@/lib/prototype-episode-detail";
import { formatTimecode } from "@/lib/timecode";
import { messages } from "@/locales/en";

/**
 * The accessible name for a shot control.
 *
 * Composed rather than left to text concatenation: the number, the timecode and
 * the state are separate inline elements, and joined without separators the name
 * reads "Shot 40:08Completed" — a screen reader says "shot forty". Every word
 * comes from the localisation resource, and the name contains all the visible
 * text (WCAG 2.5.3).
 *
 * Shared by the Scene Navigator and the timeline so the same shot is announced the
 * same way in both, which §13 asks for.
 */
export function shotAccessibleName(shot: PrototypeShot): string {
  return [
    `${messages.studio.navigator.shotLabel} ${shot.number}`,
    formatTimecode(shot.durationSeconds),
    messages.generationStatus[shot.status],
  ].join(", ");
}
