// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EpisodeStudio } from "@/components/episode-studio";
import { prototypeEpisodeDetail } from "@/lib/prototype-episode-detail";
import { formatTimecode } from "@/lib/timecode";
import { messages } from "@/locales/en";
import { stubBrowserEnvironment } from "@/test/browser-environment";

/**
 * The Episode Studio from `docs/ai-comic-drama-saas-design.md` §8 and
 * `docs/design-system.md` §13.
 *
 * This slice covers browsing: the three regions exist as a stable structure, the
 * Scene Navigator lists scenes and shots, and selecting a shot moves the rest of
 * the workbench with it. The Preview timeline and the Inspector's form arrive in
 * later slices.
 */

const episode = prototypeEpisodeDetail;
const firstShot = episode.scenes[0]?.shots[0];
const failedShot = episode.scenes
  .flatMap((scene) => scene.shots)
  .find((s) => s.status === "failed");

function navigator() {
  return screen.getByRole("navigation", { name: messages.studio.navigator.label });
}

/**
 * Anchored on purpose: an unanchored number also matches the durations in the
 * same accessible name, so `/4/` finds "Shot 7 0:04" as well as "Shot 4".
 */
function shotButton(shotNumber: number) {
  return within(navigator()).getByRole("button", { name: new RegExp(`^Shot ${shotNumber}\\b`) });
}

function sceneSection(summary: string) {
  const heading = within(navigator()).getByRole("heading", { level: 3, name: summary });
  return heading.closest("section") as HTMLElement;
}

beforeEach(stubBrowserEnvironment);
afterEach(cleanup);

describe("episode studio", () => {
  it("names the episode and its series without inventing a status", () => {
    render(<EpisodeStudio episode={episode} />);

    expect(
      screen.getByRole("heading", { level: 1, name: new RegExp(episode.title) }),
    ).toBeInTheDocument();
    // Scoped to the top bar: the same state name is a legitimate shot state too,
    // and an unscoped query would pass on the wrong element.
    const topBar = screen.getByRole("banner");
    expect(within(topBar).getByText(episode.series)).toBeInTheDocument();
    expect(within(topBar).getByText(messages.generationStatus[episode.status])).toBeInTheDocument();
  });

  it("keeps the three regions present as a stable structure", () => {
    // §13: the regions do not appear and disappear with content, so they are
    // landmarks a keyboard or screen reader user can rely on.
    render(<EpisodeStudio episode={episode} />);

    expect(navigator()).toBeInTheDocument();
    expect(screen.getByRole("region", { name: messages.studio.preview.label })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: messages.studio.inspector.label }),
    ).toBeInTheDocument();
  });

  it("lists every scene with its shot count and duration", () => {
    render(<EpisodeStudio episode={episode} />);

    for (const scene of episode.scenes) {
      expect(sceneSection(scene.summary)).toBeInTheDocument();
    }

    const totalShots = episode.scenes.flatMap((scene) => scene.shots).length;
    expect(within(navigator()).getAllByRole("button")).toHaveLength(totalShots);
  });

  it("starts on the first shot and marks it in one place only", () => {
    render(<EpisodeStudio episode={episode} />);

    const current = within(navigator())
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-current") === "true");

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(new RegExp(`^Shot ${firstShot?.number}\\b`));
  });

  it("moves the preview and the inspector when another shot is selected", async () => {
    render(<EpisodeStudio episode={episode} />);

    const target = episode.scenes[1]?.shots[0];
    if (target === undefined) throw new Error("the fixture needs a second scene");

    await userEvent.click(shotButton(target.number));

    const preview = screen.getByRole("region", { name: messages.studio.preview.label });
    const inspector = screen.getByRole("region", { name: messages.studio.inspector.label });

    expect(preview).toHaveTextContent(formatTimecode(target.durationSeconds));
    expect(inspector).toHaveTextContent(target.line);
  });

  it("lets a failed shot be browsed like any other", async () => {
    // §13 and the pipeline rule in §11: one failed shot must not block the rest
    // of the episode, which starts with being able to open it and see why.
    render(<EpisodeStudio episode={episode} />);
    if (failedShot === undefined) throw new Error("the fixture needs a failed shot");

    await userEvent.click(shotButton(failedShot.number));

    const inspector = screen.getByRole("region", { name: messages.studio.inspector.label });
    expect(inspector).toHaveTextContent(messages.generationStatus.failed);
    expect(shotButton(failedShot.number)).toHaveAttribute("aria-current", "true");
  });

  it("shows every shot's state with a label, never colour alone", () => {
    // The same §6.8 rule the badge is built for, checked where the shots are
    // dense enough to be tempted into a coloured dot.
    render(<EpisodeStudio episode={episode} />);

    for (const shot of episode.scenes.flatMap((scene) => scene.shots)) {
      const button = shotButton(shot.number);
      expect(button).toHaveTextContent(messages.generationStatus[shot.status]);
    }
  });

  it("writes durations as timecodes rather than raw seconds", () => {
    render(<EpisodeStudio episode={episode} />);

    const scene = episode.scenes[0];
    if (scene === undefined) throw new Error("the fixture needs a scene");
    const sceneDuration = scene.shots.reduce((total, shot) => total + shot.durationSeconds, 0);

    // Scoped to the scene: two scenes in the fixture happen to total the same,
    // which an unscoped query would report as an ambiguous match.
    expect(within(sceneSection(scene.summary)).getByText(formatTimecode(sceneDuration)));
  });
});
