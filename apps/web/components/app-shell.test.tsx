// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { routes } from "@/lib/routes";
import { messages } from "@/locales/en";
import { stubBrowserEnvironment } from "@/test/browser-environment";

vi.mock("next/navigation", () => ({
  usePathname: () => routes.series,
}));

beforeEach(stubBrowserEnvironment);
afterEach(cleanup);

describe("application shell", () => {
  it("puts a skip link ahead of everything else focusable", () => {
    // §15: the keyboard path has to start with a way past the header, and the
    // link is useless if a header control can take focus first.
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    const skip = screen.getByRole("link", { name: messages.shell.skipToContent });
    const main = screen.getByRole("main");

    expect(skip).toHaveAttribute("href", `#${main.id}`);
    expect(main.id).not.toBe("");
    expect(document.querySelectorAll("a[href], button, [tabindex]")[0]).toBe(skip);
  });

  it("names the pages a signed in creator moves between, and marks the current one", () => {
    // §15 forbids a state that reads from colour alone, so the current page is
    // announced rather than only shaded.
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: messages.shell.nav.label });

    expect(screen.getByRole("link", { name: messages.shell.nav.creatorHome })).toHaveAttribute(
      "href",
      routes.creatorHome,
    );
    expect(screen.getByRole("link", { name: messages.shell.nav.series })).toHaveAttribute(
      "href",
      routes.series,
    );
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent(messages.shell.nav.series);
  });

  it("keeps the theme switcher reachable from every page", () => {
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    expect(screen.getByRole("radiogroup", { name: messages.theme.group })).toBeInTheDocument();
  });
});
