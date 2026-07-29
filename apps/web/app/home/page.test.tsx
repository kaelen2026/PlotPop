// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { routes } from "@/lib/routes";
import { messages } from "@/locales/en";
import CreatorHomePage from "./page";

/**
 * The Creator Home a new account lands on. `docs/ai-comic-drama-saas-design.md`
 * §5.2 lists four regions for this page; this covers the state before any of them
 * has content, which is the state every new user sees first.
 */

function stubBrowserEnvironment(): void {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: { getItem: () => null, setItem: () => undefined },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

beforeEach(stubBrowserEnvironment);
afterEach(cleanup);

describe("creator home", () => {
  it("names the page with a single top level heading", () => {
    render(<CreatorHomePage />);

    expect(screen.getByRole("heading", { level: 1, name: messages.creatorHome.title }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("explains the empty workspace and offers the next step", () => {
    // §2.4: a new user should see the current task and the next action, not an
    // inventory of features.
    render(<CreatorHomePage />);

    expect(
      screen.getByRole("heading", { level: 2, name: messages.creatorHome.empty.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(messages.creatorHome.empty.description)).toBeInTheDocument();

    const action = screen.getByRole("link", { name: messages.creatorHome.empty.action });
    expect(action).toHaveAttribute("href", routes.newEpisode);
  });

  it("keeps the theme switcher reachable from the shell", () => {
    render(<CreatorHomePage />);

    expect(screen.getByRole("radiogroup", { name: messages.theme.group })).toBeInTheDocument();
  });

  it("puts a skip link ahead of everything else focusable", () => {
    // §15: the keyboard path has to start with a way past the header, and the
    // link is useless if the header can steal focus first.
    render(<CreatorHomePage />);

    const skip = screen.getByRole("link", { name: messages.shell.skipToContent });
    const main = screen.getByRole("main");

    expect(skip).toHaveAttribute("href", `#${main.id}`);
    expect(main.id).not.toBe("");

    const focusable = document.querySelectorAll("a[href], button, [tabindex]");
    expect(focusable[0]).toBe(skip);
  });
});
