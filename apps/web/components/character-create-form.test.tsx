// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/locales/en";
import { CharacterCreateForm } from "./character-create-form";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const post = vi.fn();

vi.mock("@/lib/api-client", () => ({
  browserApi: {
    api: {
      v1: {
        workspaces: {
          ":workspaceId": {
            series: {
              ":seriesId": { characters: { $post: (...args: unknown[]) => post(...args) } },
            },
          },
        },
      },
    },
  },
}));

/**
 * Adding a character to a series (§20.2, §32.7).
 *
 * The api client is the boundary being mocked (`.claude/rules/tdd.md` §6). What is under
 * test is the form: which request it makes, which it refuses to make, and what it tells
 * the person in front of it.
 */
const COPY = messages.series.cast.create;

const WORKSPACE_ID = "0f1a0f3a-6c4d-4f77-9c0b-1a2b3c4d5e6f";
const SERIES_ID = "3a2b1c0d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";

const APPEARANCE = "Mid twenties, cropped black hair, round glasses.";

function created() {
  return {
    status: 201,
    json: async () => ({
      id: "4b3c2d1e-5f60-4b7c-9d0e-1f2a3b4c5d6e",
      name: "Ada",
      revision: 1,
      createdAt: "2026-07-30T09:00:00.000Z",
      currentVersion: {
        version: 1,
        appearance: APPEARANCE,
        createdAt: "2026-07-30T09:00:00.000Z",
      },
    }),
  };
}

function form() {
  return render(<CharacterCreateForm seriesId={SERIES_ID} workspaceId={WORKSPACE_ID} />);
}

describe("character create form", () => {
  beforeEach(() => {
    refresh.mockReset();
    post.mockReset();
    post.mockResolvedValue(created());
  });

  it("sends the name and the appearance to the series' cast", async () => {
    form();

    await userEvent.type(screen.getByLabelText(COPY.name.label), "Ada");
    await userEvent.type(screen.getByLabelText(COPY.appearance.label), APPEARANCE);
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(post).toHaveBeenCalledWith({
      param: { workspaceId: WORKSPACE_ID, seriesId: SERIES_ID },
      json: { name: "Ada", appearance: APPEARANCE },
    });
  });

  it("empties both fields and asks the page to re-read the cast", async () => {
    form();

    await userEvent.type(screen.getByLabelText(COPY.name.label), "Ada");
    await userEvent.type(screen.getByLabelText(COPY.appearance.label), APPEARANCE);
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(refresh).toHaveBeenCalled();
    expect(screen.getByLabelText(COPY.name.label)).toHaveValue("");
    expect(screen.getByLabelText(COPY.appearance.label)).toHaveValue("");
  });

  /*
   * §32.7 makes the appearance the thing a shot is generated from, so a character without
   * one is a row that looks like progress and produces nothing. The form refuses before
   * the api has to.
   */
  it("asks the api for nothing when the appearance is missing", async () => {
    form();

    await userEvent.type(screen.getByLabelText(COPY.name.label), "Ada");
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(COPY.appearance.errors.required)).toBeInTheDocument();
    expect(screen.getByLabelText(COPY.appearance.label)).toHaveAttribute("aria-invalid", "true");
  });

  it("marks both fields when both are empty", async () => {
    form();

    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(COPY.name.errors.required)).toBeInTheDocument();
    expect(screen.getByText(COPY.appearance.errors.required)).toBeInTheDocument();
  });

  it("says which limit a too long appearance passed", async () => {
    form();

    await userEvent.type(screen.getByLabelText(COPY.name.label), "Ada");
    // Typed through `paste`: 2001 keystrokes would make this test take minutes.
    await userEvent.click(screen.getByLabelText(COPY.appearance.label));
    await userEvent.paste("A".repeat(2001));
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(COPY.appearance.errors.tooLong)).toBeInTheDocument();
  });

  it("keeps what was typed and explains it when the api refuses", async () => {
    post.mockResolvedValue({ status: 404, json: async () => ({}) });
    form();

    await userEvent.type(screen.getByLabelText(COPY.name.label), "Ada");
    await userEvent.type(screen.getByLabelText(COPY.appearance.label), APPEARANCE);
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.failed);
    // Retyping an appearance description is worse than retyping a name; nobody should
    // lose a paragraph to a failed request.
    expect(screen.getByLabelText(COPY.appearance.label)).toHaveValue(APPEARANCE);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("cannot be submitted twice while the first request is in flight", async () => {
    let release: (() => void) | undefined;
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(created());
        }),
    );

    form();
    await userEvent.type(screen.getByLabelText(COPY.name.label), "Ada");
    await userEvent.type(screen.getByLabelText(COPY.appearance.label), APPEARANCE);
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    const pending = screen.getByRole("button", { name: COPY.pending });
    expect(pending).toBeDisabled();

    await userEvent.click(pending);
    expect(post).toHaveBeenCalledTimes(1);

    release?.();
  });
});
