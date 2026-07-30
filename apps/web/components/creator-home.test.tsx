// @vitest-environment jsdom

import { GENERATION_STATUSES } from "@plotpop/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CreatorHome } from "@/components/creator-home";
import { episodeStudioRoute, routes } from "@/lib/routes";
import { messages } from "@/locales/en";
import { stubBrowserEnvironment } from "@/test/browser-environment";

/**
 * Creator Home in both of the states it can be in before any API exists.
 *
 * `docs/ai-comic-drama-saas-design.md` §5.2 gives this page four regions; this
 * covers the episode list and the state that replaces it when the account is
 * empty. Credits and the asset library are separate behaviours.
 */

function episodesForEveryStatus() {
  return GENERATION_STATUSES.map((status, index) => ({
    id: `episode-${index}`,
    title: `Episode ${index + 1}`,
    series: "Neon Alley",
    status,
  }));
}

beforeEach(stubBrowserEnvironment);
afterEach(cleanup);

describe("creator home", () => {
  it("names the page with a single top level heading", () => {
    render(<CreatorHome episodes={[]} />);

    expect(
      screen.getByRole("heading", { level: 1, name: messages.creatorHome.title }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  describe("with an empty account", () => {
    it("explains the empty workspace and offers the next step", () => {
      // §2.4: a new user should see the current task and the next action, not an
      // inventory of features.
      render(<CreatorHome episodes={[]} />);

      expect(
        screen.getByRole("heading", { level: 2, name: messages.creatorHome.empty.title }),
      ).toBeInTheDocument();
      expect(screen.getByText(messages.creatorHome.empty.description)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: messages.creatorHome.empty.action })).toHaveAttribute(
        "href",
        routes.newEpisode,
      );
    });

    it("does not render an empty episode list alongside the empty state", () => {
      render(<CreatorHome episodes={[]} />);

      // Named, because the shell's navigation is a list too: an unnamed query here
      // would pass for the wrong reason the moment the chrome grows.
      expect(
        screen.queryByRole("list", { name: messages.creatorHome.episodes.heading }),
      ).toBeNull();
    });
  });

  describe("with episodes", () => {
    it("lists every episode as a named list item", () => {
      const episodes = episodesForEveryStatus();
      render(<CreatorHome episodes={episodes} />);

      const list = screen.getByRole("list", { name: messages.creatorHome.episodes.heading });
      expect(list.querySelectorAll("li")).toHaveLength(episodes.length);

      for (const episode of episodes) {
        expect(screen.getByText(episode.title)).toBeInTheDocument();
      }
    });

    it("opens an episode in its Studio", () => {
      const episodes = episodesForEveryStatus();
      render(<CreatorHome episodes={episodes} />);

      for (const episode of episodes) {
        expect(screen.getByRole("link", { name: episode.title })).toHaveAttribute(
          "href",
          episodeStudioRoute(episode.id),
        );
      }
    });

    it("shows the documented label for each state", () => {
      // §12.4: the page renders the contract's states and never invents a name.
      const episodes = episodesForEveryStatus();
      render(<CreatorHome episodes={episodes} />);

      for (const status of GENERATION_STATUSES) {
        expect(screen.getByText(messages.generationStatus[status])).toBeInTheDocument();
      }
    });

    it("replaces the empty state once there is something to show", () => {
      render(<CreatorHome episodes={episodesForEveryStatus()} />);

      expect(screen.queryByText(messages.creatorHome.empty.title)).toBeNull();
      expect(screen.getByRole("link", { name: messages.creatorHome.empty.action })).toHaveAttribute(
        "href",
        routes.newEpisode,
      );
    });
  });
});
