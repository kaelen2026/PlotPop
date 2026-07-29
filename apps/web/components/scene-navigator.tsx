import { GenerationStatusBadge } from "@plotpop/ui/components/generation-status-badge";
import { cn } from "@plotpop/ui/lib/cn";
import type { PrototypeScene, PrototypeShot } from "@/lib/prototype-episode-detail";
import { formatTimecode } from "@/lib/timecode";
import { messages } from "@/locales/en";

/**
 * The Scene Navigator column (§8 of the design spec).
 *
 * Shots are buttons rather than list rows with click handlers, so the keyboard
 * path and the accessible name come from the platform. `aria-current` marks the
 * one being inspected, and it is the only place that mark exists — §13 wants the
 * current scene, shot and approved version to read differently but consistently,
 * which is impossible if two elements both claim to be current.
 */
export function SceneNavigator({
  scenes,
  currentShotId,
  onSelectShot,
}: {
  scenes: PrototypeScene[];
  currentShotId: string;
  onSelectShot: (shot: PrototypeShot) => void;
}) {
  return (
    <nav
      aria-label={messages.studio.navigator.label}
      className="flex flex-col gap-6 p-4 xl:overflow-y-auto"
    >
      {scenes.map((scene) => {
        const duration = scene.shots.reduce((total, shot) => total + shot.durationSeconds, 0);
        const holdsCurrentShot = scene.shots.some((shot) => shot.id === currentShotId);

        return (
          <section key={scene.id} className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-label-xs text-muted-foreground">
                {messages.studio.navigator.sceneLabel} {scene.number}
              </span>
              {/* Level 3: below the episode title and the column's own heading. */}
              <h3
                className={cn(
                  "text-heading-xs",
                  holdsCurrentShot ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {scene.summary}
              </h3>
              <span className="text-mono-sm text-muted-foreground">{formatTimecode(duration)}</span>
            </div>

            <ul className="flex flex-col">
              {scene.shots.map((shot) => {
                const isCurrent = shot.id === currentShotId;

                return (
                  <li key={shot.id}>
                    <button
                      type="button"
                      aria-current={isCurrent ? "true" : undefined}
                      // Named explicitly because the parts are separate inline
                      // elements: concatenated, the number runs into the timecode
                      // and the name reads "Shot 40:08Completed". Every word still
                      // comes from the localisation resource, and the name
                      // contains all the visible text (WCAG 2.5.3).
                      aria-label={`${messages.studio.navigator.shotLabel} ${shot.number}, ${formatTimecode(shot.durationSeconds)}, ${messages.generationStatus[shot.status]}`}
                      onClick={() => onSelectShot(shot)}
                      className={cn(
                        // §13: a dense list may tighten spacing but not shrink the
                        // target, so the row keeps a full control height.
                        "flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left focus-visible:focus-ring",
                        // At Large the column is fixed at 240px (§8.4), which is
                        // not enough for a shot, a timecode and a two word state
                        // on one line — the state takes its own line rather than
                        // the label wrapping mid phrase.
                        "xl:flex-col xl:items-start xl:gap-1",
                        isCurrent ? "bg-secondary text-secondary-foreground" : "hover:bg-muted",
                      )}
                    >
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-label-md">
                          {messages.studio.navigator.shotLabel} {shot.number}
                        </span>
                        <span className="text-mono-sm text-muted-foreground">
                          {formatTimecode(shot.durationSeconds)}
                        </span>
                      </span>
                      <GenerationStatusBadge
                        status={shot.status}
                        labels={messages.generationStatus}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
