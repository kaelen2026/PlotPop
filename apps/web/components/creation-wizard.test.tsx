// @vitest-environment jsdom

import { type CreditEstimate, EPISODE_SCRIPT_MIN_LENGTH } from "@plotpop/contracts";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CreationWizard } from "@/components/creation-wizard";
import { CREATION_STEPS } from "@/lib/creation-steps";
import { messages } from "@/locales/en";
import { stubBrowserEnvironment } from "@/test/browser-environment";

/**
 * The five step wizard from `docs/ai-comic-drama-saas-design.md` §5.3.
 *
 * The rules under test are §11.2's: a Field marks itself `data-invalid`, the
 * control carries `aria-invalid`, and a Zod failure reaches the user both as a
 * field level message and as a form level summary. A form that only turns a
 * border red communicates nothing to a screen reader.
 */

const script = "Rooftop. Night. ".repeat(Math.ceil(EPISODE_SCRIPT_MIN_LENGTH / 16));

function estimate(overrides: Partial<CreditEstimate> = {}): CreditEstimate {
  return { minCredits: 320, maxCredits: 480, balanceCredits: 1200, ...overrides };
}

function renderWizard(overrides: Partial<CreditEstimate> = {}) {
  return render(<CreationWizard estimate={estimate(overrides)} />);
}

async function walkToAnimate() {
  await userEvent.type(titleField(), "Rooftop Confession");
  await userEvent.type(scriptField(), script);
  for (const _step of ["script", "cast", "storyboard"]) {
    await userEvent.click(continueButton());
  }
}

function stepItems() {
  // Scoped to the step list on purpose: the error summary is a list too, and an
  // unscoped `listitem` query would silently mix the two.
  return within(screen.getByRole("list", { name: messages.wizard.steps.label })).getAllByRole(
    "listitem",
  );
}

function titleField() {
  return screen.getByRole("textbox", { name: messages.wizard.script.title.label });
}

function scriptField() {
  return screen.getByRole("textbox", { name: messages.wizard.script.body.label });
}

function continueButton() {
  return screen.getByRole("button", { name: messages.wizard.continue });
}

async function completeScriptStep() {
  await userEvent.type(titleField(), "Rooftop Confession");
  await userEvent.type(scriptField(), script);
  await userEvent.click(continueButton());
}

beforeEach(stubBrowserEnvironment);
afterEach(cleanup);

describe("creation wizard", () => {
  it("shows all five steps and marks the first as current", () => {
    renderWizard();

    const steps = stepItems();
    expect(steps).toHaveLength(CREATION_STEPS.length);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(steps.at(-1)).not.toHaveAttribute("aria-current");
    expect(within(steps[0] as HTMLElement).getByText(messages.wizard.steps.script));
    expect(within(steps.at(-1) as HTMLElement).getByText(messages.wizard.steps.export));
  });

  it("refuses an empty submission and says why, per field and in a summary", async () => {
    renderWizard();

    await userEvent.click(continueButton());

    // Field level: the control is marked invalid and carries its own message.
    expect(titleField()).toHaveAttribute("aria-invalid", "true");
    expect(scriptField()).toHaveAttribute("aria-invalid", "true");
    const titleGroup = titleField().closest('[data-slot="field"]') as HTMLElement;
    expect(
      within(titleGroup).getByText(messages.wizard.script.title.errors.required),
    ).toBeInTheDocument();

    // Form level: the same problems again, gathered in one place. §11.2 asks for
    // both, so the message appearing twice is the requirement, not a duplicate.
    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent(messages.wizard.errorSummary.title);
    expect(summary.querySelectorAll("li")).toHaveLength(2);
    expect(summary).toHaveTextContent(messages.wizard.script.body.errors.tooShort);

    // And the user has not been moved on.
    expect(stepItems()[0]).toHaveAttribute("aria-current", "step");
  });

  it("announces the failure once rather than once per field", async () => {
    // The registry's FieldError is a live region on its own, which would make a
    // two field failure speak three times. The summary is the one announcement,
    // and the field messages are reached through `aria-describedby`.
    renderWizard();

    await userEvent.click(continueButton());

    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("moves focus to the summary so the failure is not missed", async () => {
    // §15: a state change has to be perceivable. Leaving focus on a submit button
    // that did nothing is how a keyboard user gets stuck.
    renderWizard();

    await userEvent.click(continueButton());

    expect(screen.getByRole("alert")).toHaveFocus();
  });

  it("marks the invalid field group so the label and message travel together", async () => {
    renderWizard();

    await userEvent.click(continueButton());

    expect(titleField().closest('[data-slot="field"]')).toHaveAttribute("data-invalid", "true");
  });

  it("names the field's message as its description", async () => {
    // §15: the message has to reach a screen reader through the control, not only
    // by sitting next to it on screen.
    renderWizard();

    await userEvent.click(continueButton());

    const described = titleField().getAttribute("aria-describedby") ?? "";
    expect(described).not.toBe("");
    expect(document.getElementById(described.split(" ")[0] as string)).toHaveTextContent(
      messages.wizard.script.title.errors.required,
    );
  });

  it("clears the errors and advances once the draft is valid", async () => {
    renderWizard();

    await completeScriptStep();

    expect(stepItems()[1]).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: messages.wizard.steps.cast }),
    ).toBeInTheDocument();
  });

  it("keeps what was typed when the user steps back", async () => {
    // A wizard that forgets the script the moment you look at the next step is
    // worse than no wizard.
    renderWizard();

    await completeScriptStep();
    await userEvent.click(screen.getByRole("button", { name: messages.wizard.back }));

    expect(titleField()).toHaveValue("Rooftop Confession");
    expect(scriptField()).toHaveValue(script);
  });

  it("offers no way past the last step", async () => {
    renderWizard();

    await walkToAnimate();
    await userEvent.click(screen.getByRole("button", { name: messages.wizard.animate.confirm }));

    expect(stepItems().at(-1)).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("button", { name: messages.wizard.continue })).toBeNull();
    expect(screen.queryByRole("button", { name: messages.wizard.animate.confirm })).toBeNull();
  });

  describe("the animate step", () => {
    it("shows the estimate and the balance before anything is generated", async () => {
      // §10: a paid generation must show its estimate and be confirmed first.
      renderWizard();
      await walkToAnimate();

      expect(screen.getByText(messages.creditCost.estimateLabel)).toBeInTheDocument();
      expect(screen.getByText(messages.creditCost.balanceLabel)).toBeInTheDocument();
      expect(screen.getByText("320")).toBeInTheDocument();
      expect(screen.getByText("480")).toBeInTheDocument();
    });

    it("asks for the cost to be confirmed rather than just continuing", async () => {
      renderWizard();
      await walkToAnimate();

      expect(screen.queryByRole("button", { name: messages.wizard.continue })).toBeNull();
      expect(screen.getByRole("button", { name: messages.wizard.animate.confirm })).toBeEnabled();
    });

    it("refuses to generate when the balance does not cover the estimate", async () => {
      // The upper bound is what matters: starting a generation that cannot finish
      // is worse than not starting it.
      renderWizard({ balanceCredits: 400 });
      await walkToAnimate();

      expect(screen.getByText(messages.creditCost.insufficient)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: messages.wizard.animate.blocked })).toBeDisabled();
    });

    it("asks again when the quote changed since it was confirmed", async () => {
      // ADR-005: a confirmed ceiling is not a licence for a dearer route.
      renderWizard({ changeReason: "estimate_increased" });
      await walkToAnimate();

      expect(screen.getByText(messages.creditCost.reconfirm)).toBeInTheDocument();
      expect(
        screen.getByText(messages.creditCost.changeReasons.estimate_increased),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: messages.wizard.animate.reconfirm })).toBeEnabled();
    });
  });

  it("offers no way back from the first step", () => {
    renderWizard();

    expect(screen.queryByRole("button", { name: messages.wizard.back })).toBeNull();
  });
});
