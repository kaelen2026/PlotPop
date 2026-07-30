// @vitest-environment jsdom

import type { Series } from "@plotpop/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/locales/en";
import { SeriesLibrary } from "./series-library";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

/**
 * The series library (`docs/ai-comic-drama-saas-design.md` §5.2).
 *
 * It takes its series as a prop rather than reading them, so both display states are
 * reachable in a test and connecting a different source is a change of caller rather
 * than a change of component.
 */
const COPY = messages.series;

const WORKSPACE_ID = "0f1a0f3a-6c4d-4f77-9c0b-1a2b3c4d5e6f";

function series(name: string, id: string): Series {
  return { id, name, revision: 1, createdAt: "2026-07-30T09:00:00.000Z" };
}

describe("series library", () => {
  it("lists the series it was given, in the order they arrived", async () => {
    render(
      <SeriesLibrary
        series={[
          series("Midnight Diner", "3a2b1c0d-4e5f-4a6b-8c9d-0e1f2a3b4c5d"),
          series("Rooftop Confessions", "4b3c2d1e-5f60-4b7c-9d0e-1f2a3b4c5d6e"),
        ]}
        workspaceId={WORKSPACE_ID}
      />,
    );

    // A real list, so assistive technology announces how many there are. The api
    // orders it newest first; the component does not reorder what it was handed.
    const items = screen.getByRole("list", { name: COPY.list.heading }).querySelectorAll("li");

    expect([...items].map((item) => item.textContent)).toEqual([
      "Midnight Diner",
      "Rooftop Confessions",
    ]);
  });

  it("offers the empty state instead of an empty list on a new account", () => {
    render(<SeriesLibrary series={[]} workspaceId={WORKSPACE_ID} />);

    expect(screen.getByText(COPY.empty.title)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: COPY.list.heading })).not.toBeInTheDocument();
  });

  it("keeps the create form reachable in both states", () => {
    // §12.1: the page's one primary action. A library you cannot add to is a dead
    // end, and an empty account is exactly when the action matters most.
    render(<SeriesLibrary series={[]} workspaceId={WORKSPACE_ID} />);
    expect(screen.getByRole("button", { name: COPY.create.submit })).toBeInTheDocument();

    render(
      <SeriesLibrary
        series={[series("Midnight Diner", "3a2b1c0d-4e5f-4a6b-8c9d-0e1f2a3b4c5d")]}
        workspaceId={WORKSPACE_ID}
      />,
    );
    expect(screen.getAllByRole("button", { name: COPY.create.submit })).not.toHaveLength(0);
  });
});
