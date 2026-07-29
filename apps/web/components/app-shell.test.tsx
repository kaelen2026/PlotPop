// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "@/components/app-shell";
import { messages } from "@/locales/en";
import { stubBrowserEnvironment } from "@/test/browser-environment";

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

  it("keeps the theme switcher reachable from every page", () => {
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    expect(screen.getByRole("radiogroup", { name: messages.theme.group })).toBeInTheDocument();
  });
});
