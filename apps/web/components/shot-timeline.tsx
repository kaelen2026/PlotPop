import { cn } from "@plotpop/ui/lib/cn";
import type { PrototypeShot } from "@/lib/prototype-episode-detail";
import { shotAccessibleName } from "@/lib/shot-label";
import { formatTimecode } from "@/lib/timecode";
import { messages } from "@/locales/en";

/**
 * The episode timeline (§8 of the design spec, §13 of the design system).
 *
 * Shows the same shots as the Scene Navigator ordered by time rather than by
 * scene, which is why both exist: one answers "where in the story", the other
 * "where in the episode".
 *
 * Clip widths come from `flexGrow`, so a duration becomes a proportion without a
 * hardcoded width anywhere — §16 rules out arbitrary values, and a percentage
 * computed from data is not one.
 *
 * §8.4 forbids compressing a full timeline onto a phone, so this is absent below
 * Medium; the Scene Navigator already gives shot by shot access there.
 */
export function ShotTimeline({
  shots,
  currentShotId,
  onSelectShot,
}: {
  shots: PrototypeShot[];
  currentShotId: string;
  onSelectShot: (shot: PrototypeShot) => void;
}) {
  const total = shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
  const currentIndex = shots.findIndex((shot) => shot.id === currentShotId);
  const elapsed = shots
    .slice(0, Math.max(currentIndex, 0))
    .reduce((sum, shot) => sum + shot.durationSeconds, 0);

  return (
    <div className="hidden flex-col gap-2 md:flex">
      <div className="flex items-center gap-2 text-label-xs text-muted-foreground">
        <span>{messages.studio.timeline.elapsedLabel}</span>
        <span className="text-mono-sm text-foreground">{formatTimecode(elapsed)}</span>
        <span>{messages.studio.timeline.totalLabel}</span>
        <span className="text-mono-sm">{formatTimecode(total)}</span>
      </div>

      {/* An ordered list: the clips are a sequence, so position and count come from
          the platform rather than from the visual order alone. */}
      <ol
        aria-label={messages.studio.timeline.label}
        className="flex h-12 w-full items-stretch gap-1 rounded-md bg-timeline-track p-1"
      >
        {shots.map((shot) => {
          const isCurrent = shot.id === currentShotId;

          return (
            <li
              key={shot.id}
              // The duration becomes a proportion here, so no width is hardcoded.
              style={{ flexGrow: shot.durationSeconds, flexBasis: 0 }}
              className="flex min-w-0"
            >
              <button
                type="button"
                aria-current={isCurrent ? "true" : undefined}
                aria-label={shotAccessibleName(shot)}
                onClick={() => onSelectShot(shot)}
                className={cn(
                  "w-full min-w-0 overflow-hidden rounded-sm bg-timeline-clip px-2 text-mono-sm text-timeline-clip-foreground focus-visible:focus-ring",
                  // §6.2 gives selection to accent, and §5.4 keeps a bright brand
                  // colour off a whole surface, so it is the boundary and the
                  // playhead rather than a fill.
                  isCurrent
                    ? "border-2 border-timeline-selection"
                    : "border-2 border-transparent hover:border-border",
                )}
              >
                {shot.number}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
