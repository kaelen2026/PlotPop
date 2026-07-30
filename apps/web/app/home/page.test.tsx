// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prototypeEpisodes } from "@/lib/prototype-episodes";
import { messages } from "@/locales/en";
import { stubBrowserEnvironment } from "@/test/browser-environment";
import CreatorHomePage from "./page";

beforeEach(stubBrowserEnvironment);
afterEach(cleanup);

describe("creator home route", () => {
  it("shows the episodes the route hands to the page", () => {
    // Wiring only. Both display states are covered against `CreatorHome`
    // directly, since that is the component which can be given either one.
    render(<CreatorHomePage />);

    const list = screen.getByRole("list", { name: messages.creatorHome.episodes.heading });

    expect(list.querySelectorAll("li")).toHaveLength(prototypeEpisodes.length);
  });
});
