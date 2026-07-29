// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShotTimeline } from "@/components/shot-timeline";
import { prototypeEpisodeDetail } from "@/lib/prototype-episode-detail";
import { formatTimecode } from "@/lib/timecode";
import { messages } from "@/locales/en";

/**
 * The timeline half of the Preview region (§8 of the design spec, §13 of the
 * design system).
 *
 * It shows the same shots as the Scene Navigator, ordered by time rather than by
 * scene, which is the whole reason both exist: one answers "where in the story",
 * the other "where in the episode".
 */

const shots = prototypeEpisodeDetail.scenes.flatMap((scene) => scene.shots);
const firstShot = shots[0];

function timeline() {
  return screen.getByRole("list", { name: messages.studio.timeline.label });
}

function clips() {
  return within(timeline()).getAllByRole("button");
}

afterEach(cleanup);

describe("shot timeline", () => {
  it("shows one clip per shot, in episode order", () => {
    render(
      <ShotTimeline shots={shots} currentShotId={firstShot?.id ?? ""} onSelectShot={() => {}} />,
    );

    const rendered = clips();
    expect(rendered).toHaveLength(shots.length);
    for (const [index, shot] of shots.entries()) {
      expect(rendered[index]).toHaveAccessibleName(new RegExp(`^Shot ${shot.number}\\b`));
    }
  });

  it("sizes each clip by its duration", () => {
    // A timeline whose clips are all the same width is a list, not a timeline.
    render(
      <ShotTimeline shots={shots} currentShotId={firstShot?.id ?? ""} onSelectShot={() => {}} />,
    );

    const items = within(timeline()).getAllByRole("listitem");
    for (const [index, shot] of shots.entries()) {
      expect(items[index]?.style.flexGrow).toBe(String(shot.durationSeconds));
    }
  });

  it("marks the current shot once, and with the accent selection", () => {
    // §6.2 gives 选中 to accent, and §13 wants the current shot to read the same
    // way wherever it is shown.
    const current = shots[3];
    render(
      <ShotTimeline shots={shots} currentShotId={current?.id ?? ""} onSelectShot={() => {}} />,
    );

    const marked = clips().filter((clip) => clip.getAttribute("aria-current") === "true");
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveAccessibleName(new RegExp(`^Shot ${current?.number}\\b`));
    expect(marked[0]?.className).toContain("timeline-selection");
  });

  it("selects a shot when its clip is used", async () => {
    const onSelectShot = vi.fn();
    const target = shots[2];
    render(
      <ShotTimeline
        shots={shots}
        currentShotId={firstShot?.id ?? ""}
        onSelectShot={onSelectShot}
      />,
    );

    await userEvent.click(
      within(timeline()).getByRole("button", { name: new RegExp(`^Shot ${target?.number}\\b`) }),
    );

    expect(onSelectShot).toHaveBeenCalledWith(target);
  });

  it("places the playhead at the current shot's start", () => {
    // The elapsed reading is what tells the user where they are in a 5 to 10
    // minute episode, which a scene list cannot.
    const current = shots[2];
    const elapsed = shots.slice(0, 2).reduce((total, shot) => total + shot.durationSeconds, 0);
    render(
      <ShotTimeline shots={shots} currentShotId={current?.id ?? ""} onSelectShot={() => {}} />,
    );

    expect(screen.getByText(formatTimecode(elapsed))).toBeInTheDocument();
  });

  it("shows the episode's full duration as context", () => {
    const total = shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
    render(
      <ShotTimeline shots={shots} currentShotId={firstShot?.id ?? ""} onSelectShot={() => {}} />,
    );

    expect(screen.getByText(formatTimecode(total))).toBeInTheDocument();
  });

  it("names every clip with its state, never colour alone", () => {
    render(
      <ShotTimeline shots={shots} currentShotId={firstShot?.id ?? ""} onSelectShot={() => {}} />,
    );

    for (const [index, shot] of shots.entries()) {
      expect(clips()[index]).toHaveAccessibleName(
        new RegExp(messages.generationStatus[shot.status]),
      );
    }
  });

  it("stays out of the Small tier rather than being squeezed", () => {
    // §8.4: a full timeline must not be compressed onto a phone. The Scene
    // Navigator already gives shot by shot access there, and the visual baseline
    // at the Small viewport is what proves it is absent.
    const { container } = render(
      <ShotTimeline shots={shots} currentShotId={firstShot?.id ?? ""} onSelectShot={() => {}} />,
    );

    const root = container.firstElementChild;
    expect(root?.className).toContain("hidden");
    expect(root?.className).toContain("md:flex");
  });
});
