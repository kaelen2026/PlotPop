// @vitest-environment jsdom

import type { Character, Series } from "@plotpop/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/locales/en";
import { SeriesDetail } from "./series-detail";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

/**
 * One series and its cast (`docs/ai-comic-drama-saas-design.md` §5.2, §20.2).
 *
 * Takes both as props rather than reading them, so every display state is reachable in a
 * test and the page above stays the only place that talks to the api.
 */
const COPY = messages.series.cast;

const WORKSPACE_ID = "0f1a0f3a-6c4d-4f77-9c0b-1a2b3c4d5e6f";

const SERIES: Series = {
  id: "3a2b1c0d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
  name: "Rooftop Confessions",
  revision: 1,
  createdAt: "2026-07-30T09:00:00.000Z",
};

function character(name: string, id: string, version: number, appearance: string): Character {
  return {
    id,
    name,
    revision: 1,
    createdAt: "2026-07-30T09:00:00.000Z",
    currentVersion: { version, appearance, createdAt: "2026-07-30T09:00:00.000Z" },
  };
}

const ADA = character(
  "Ada",
  "4b3c2d1e-5f60-4b7c-9d0e-1f2a3b4c5d6e",
  1,
  "Round glasses, grey coat.",
);
const BAO = character("Bao", "5c4d3e2f-6071-4c8d-9e1f-2a3b4c5d6e7f", 3, "Tall, shaved head.");

describe("series detail", () => {
  it("names the series it is showing", () => {
    render(<SeriesDetail characters={[]} series={SERIES} workspaceId={WORKSPACE_ID} />);

    expect(screen.getByRole("heading", { level: 1, name: SERIES.name })).toBeInTheDocument();
  });

  it("lists the cast with each character's current version and appearance", () => {
    render(<SeriesDetail characters={[ADA, BAO]} series={SERIES} workspaceId={WORKSPACE_ID} />);

    const items = screen.getAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Ada");
    expect(items[0]).toHaveTextContent(ADA.currentVersion.appearance);
    /*
     * The version is on screen because §32.7 makes it the thing an episode locks: a
     * creator who cannot see which version is current cannot reason about why an old
     * episode still looks the way it does.
     */
    expect(items[1]).toHaveTextContent(`${COPY.version} ${BAO.currentVersion.version}`);
  });

  it("offers the empty state instead of an empty list on a new series", () => {
    render(<SeriesDetail characters={[]} series={SERIES} workspaceId={WORKSPACE_ID} />);

    expect(screen.getByText(COPY.empty.title)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: COPY.heading })).not.toBeInTheDocument();
  });

  it("keeps the add form reachable in both states", () => {
    // A cast you cannot add to is a dead end, and an empty series is when the action
    // matters most (§12.1).
    render(<SeriesDetail characters={[]} series={SERIES} workspaceId={WORKSPACE_ID} />);
    expect(screen.getByRole("button", { name: COPY.create.submit })).toBeInTheDocument();

    render(<SeriesDetail characters={[ADA]} series={SERIES} workspaceId={WORKSPACE_ID} />);
    expect(screen.getAllByRole("button", { name: COPY.create.submit })).not.toHaveLength(0);
  });
});
