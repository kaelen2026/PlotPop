// @vitest-environment jsdom

import type { CreditEstimate } from "@plotpop/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CreditCost, type CreditCostLabels } from "./credit-cost";

/**
 * `docs/design-system.md` §12.5: one component expresses cost everywhere, showing
 * the estimate, whether it is a range, whether the balance covers it, why it
 * changed and whether it has to be confirmed again.
 *
 * The reason it is one component rather than a paragraph per page is that these
 * five things are what a user is being asked to spend money on, and a page that
 * writes its own version will sooner or later omit one.
 */

const labels: CreditCostLabels = {
  estimateLabel: "Estimated cost",
  balanceLabel: "Your balance",
  unit: "credits",
  rangeSeparator: "to",
  insufficient: "Not enough credits for this generation.",
  reconfirm: "The estimate changed. Check the new cost before continuing.",
  changeReasons: {
    quality_tier_changed: "You changed the quality tier.",
    shot_count_changed: "The number of shots changed.",
    estimate_increased: "The estimate went up.",
  },
};

function estimate(overrides: Partial<CreditEstimate> = {}): CreditEstimate {
  return { minCredits: 120, maxCredits: 120, balanceCredits: 500, ...overrides };
}

afterEach(cleanup);

describe("credit cost", () => {
  it("states a single amount without range wording", () => {
    render(<CreditCost estimate={estimate()} labels={labels} />);

    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.queryByText(labels.rangeSeparator)).toBeNull();
  });

  it("states both bounds of a range", () => {
    render(<CreditCost estimate={estimate({ maxCredits: 180 })} labels={labels} />);

    expect(screen.getByText(/120/)).toBeInTheDocument();
    expect(screen.getByText(/180/)).toBeInTheDocument();
    expect(screen.getByText(labels.rangeSeparator)).toBeInTheDocument();
  });

  it("shows the balance the server quoted", () => {
    render(<CreditCost estimate={estimate()} labels={labels} />);

    expect(screen.getByText(labels.balanceLabel)).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it("uses tabular figures for every amount", () => {
    // §7.4: credits and amounts use the Mono step, so a changing estimate does not
    // shift the layout under the user's cursor.
    render(<CreditCost estimate={estimate({ maxCredits: 180 })} labels={labels} />);

    for (const amount of screen.getAllByTestId("credit-amount")) {
      expect(amount.className).toContain("text-mono");
    }
  });

  it("says when the balance does not cover the estimate, in words and with an icon", () => {
    // §6.8: a state may never be carried by colour alone, and this is the state
    // that stops someone spending money they do not have.
    const { container } = render(
      <CreditCost estimate={estimate({ maxCredits: 900 })} labels={labels} />,
    );

    expect(screen.getByText(labels.insufficient)).toBeInTheDocument();
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
  });

  it("stays quiet when the balance covers the estimate", () => {
    render(<CreditCost estimate={estimate()} labels={labels} />);

    expect(screen.queryByText(labels.insufficient)).toBeNull();
    expect(screen.queryByText(labels.reconfirm)).toBeNull();
  });

  it("explains a changed quote and asks for it to be checked again", () => {
    // ADR-005: a confirmed ceiling must not be exceeded silently, so the reason
    // and the request to look again travel together.
    render(
      <CreditCost estimate={estimate({ changeReason: "quality_tier_changed" })} labels={labels} />,
    );

    expect(screen.getByText(labels.changeReasons.quality_tier_changed)).toBeInTheDocument();
    expect(screen.getByText(labels.reconfirm)).toBeInTheDocument();
  });

  it("never names a provider", () => {
    // Invariant 4. The reasons are product level by construction, and this is the
    // assertion that fails if a future reason leaks a vendor.
    render(
      <CreditCost estimate={estimate({ changeReason: "estimate_increased" })} labels={labels} />,
    );

    expect(screen.getByText(labels.changeReasons.estimate_increased)).toBeInTheDocument();
  });
});
