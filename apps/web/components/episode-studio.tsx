"use client";

import { GenerationStatusBadge } from "@plotpop/ui/components/generation-status-badge";
import { useState } from "react";
import { SceneNavigator } from "@/components/scene-navigator";
import { ShotTimeline } from "@/components/shot-timeline";
import type { PrototypeEpisodeDetail } from "@/lib/prototype-episode-detail";
import { formatTimecode } from "@/lib/timecode";
import { messages } from "@/locales/en";

/**
 * The Episode Studio workbench (§8 of the design spec, §13 of the design system).
 *
 * The three regions are a fixed structure: they exist whether or not they have
 * content, so a keyboard or screen reader user can rely on the landmarks. §8.4's
 * column widths live in the `studio-grid` utility rather than here, because they
 * are a rule rather than a layout choice this page gets to make.
 *
 * The Preview's timeline and the Inspector's editing form arrive in later slices.
 * What this delivers is browsing: selecting a shot moves the whole workbench,
 * including a failed one — §13 requires one failure not to block the rest.
 */
export function EpisodeStudio({ episode }: { episode: PrototypeEpisodeDetail }) {
  const shots = episode.scenes.flatMap((scene) => scene.shots);
  const [currentShotId, setCurrentShotId] = useState(shots[0]?.id ?? "");
  const currentShot = shots.find((shot) => shot.id === currentShotId) ?? shots[0];

  return (
    // §8.3: the Studio is the one workspace with no container width.
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 stroke-hairline-b p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <span className="text-label-xs text-muted-foreground">{episode.series}</span>
          <h1 className="text-heading-md">{episode.title}</h1>
        </div>
        <GenerationStatusBadge status={episode.status} labels={messages.generationStatus} />
      </header>

      {/* A `main` landmark, so the workbench is reachable the same way every
          other page's content is. */}
      <main className="studio-grid flex-1 xl:min-h-0">
        <div className="stroke-hairline-b xl:border-b-0 xl:border-r xl:border-r-border">
          <SceneNavigator
            scenes={episode.scenes}
            currentShotId={currentShotId}
            onSelectShot={(shot) => setCurrentShotId(shot.id)}
          />
        </div>

        <section
          aria-label={messages.studio.preview.label}
          className="flex flex-col gap-4 p-4 md:p-6"
        >
          {/* §13 and §6.5: the media surface stays neutral dark in both themes, so
              the theme never colours the user's judgement of the frame. */}
          <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-preview text-preview-foreground">
            <span className="text-body-sm">{messages.studio.preview.empty}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-label-md">
              {messages.studio.navigator.shotLabel} {currentShot?.number}
            </span>
            <span className="text-mono-md text-muted-foreground">
              {formatTimecode(currentShot?.durationSeconds ?? 0)}
            </span>
          </div>

          <ShotTimeline
            shots={shots}
            currentShotId={currentShotId}
            onSelectShot={(shot) => setCurrentShotId(shot.id)}
          />
        </section>

        <section
          aria-label={messages.studio.inspector.label}
          className="flex flex-col gap-4 p-4 stroke-hairline-b md:p-6 xl:border-b-0 xl:border-l xl:border-l-border"
        >
          <h2 className="text-heading-xs">{messages.studio.inspector.label}</h2>
          <dl className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-label-xs text-muted-foreground">
                {messages.studio.inspector.status}
              </dt>
              <dd>
                {currentShot === undefined ? null : (
                  <GenerationStatusBadge
                    status={currentShot.status}
                    labels={messages.generationStatus}
                  />
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-label-xs text-muted-foreground">
                {messages.studio.inspector.duration}
              </dt>
              <dd className="text-mono-md">{formatTimecode(currentShot?.durationSeconds ?? 0)}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-label-xs text-muted-foreground">
                {messages.studio.inspector.line}
              </dt>
              <dd className="text-body-sm">
                {currentShot?.line === "" ? (
                  <span className="text-muted-foreground">{messages.studio.inspector.noLine}</span>
                ) : (
                  currentShot?.line
                )}
              </dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  );
}
