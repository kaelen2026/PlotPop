// @vitest-environment jsdom

import { GENERATION_STATUSES } from "@plotpop/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GenerationStatusBadge, type GenerationStatusLabels } from "./generation-status-badge";

/**
 * `docs/design-system.md` §12.4 and §6.8. The rule these tests exist for is that
 * a status may never be distinguishable by colour alone — colour is invisible to
 * a screen reader and unreliable for a large share of users, so every state has
 * to carry a label and an icon as well.
 */

const labels: GenerationStatusLabels = {
  draft: "Draft",
  queued: "Queued",
  generating: "Generating",
  needs_review: "Needs review",
  completed: "Completed",
  failed: "Failed",
};

afterEach(cleanup);

describe("generation status badge", () => {
  it.each(GENERATION_STATUSES)("shows a label and an icon for %s", (status) => {
    const { container } = render(<GenerationStatusBadge status={status} labels={labels} />);

    expect(screen.getByText(labels[status])).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("gives every state its own icon", () => {
    // Two states sharing an icon would collapse them into a colour difference,
    // which is the thing §6.8 rules out.
    const icons = GENERATION_STATUSES.map((status) => {
      const { container, unmount } = render(
        <GenerationStatusBadge status={status} labels={labels} />,
      );
      const markup = container.querySelector("svg")?.innerHTML ?? "";
      unmount();
      return markup;
    });

    expect(new Set(icons).size).toBe(GENERATION_STATUSES.length);
    expect(icons.every((icon) => icon !== "")).toBe(true);
  });

  it("uses the semantic variant documented for each state", () => {
    const variants = Object.fromEntries(
      GENERATION_STATUSES.map((status) => {
        const { container, unmount } = render(
          <GenerationStatusBadge status={status} labels={labels} />,
        );
        const variant = container
          .querySelector('[data-slot="badge"]')
          ?.getAttribute("data-variant");
        unmount();
        return [status, variant];
      }),
    );

    expect(variants).toEqual({
      draft: "secondary",
      queued: "info",
      generating: "info",
      needs_review: "warning",
      completed: "success",
      failed: "destructive",
    });
  });

  it("keeps the state readable by assistive technology", () => {
    // The icon is decorative: the text is the state. An icon exposed as an
    // unnamed graphic would be announced as noise between the two.
    const { container } = render(<GenerationStatusBadge status="failed" labels={labels} />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.textContent).toBe(labels.failed);
  });

  it("marks the state on the element for styling and end to end selectors", () => {
    const { container } = render(<GenerationStatusBadge status="generating" labels={labels} />);

    expect(container.querySelector('[data-status="generating"]')).not.toBeNull();
  });
});
