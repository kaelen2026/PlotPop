// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/locales/en";
import { SeriesCreateForm } from "./series-create-form";

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
          ":workspaceId": { series: { $post: (...args: unknown[]) => post(...args) } },
        },
      },
    },
  },
}));

/**
 * Creating a series from the library page.
 *
 * The api client is the boundary being mocked (`.claude/rules/tdd.md` §6). What is
 * under test is the form: which request it makes, which it refuses to make, and what
 * it tells the person in front of it.
 *
 * Assertions are on accessible state and on text, never on classes:
 * `docs/design-system.md` §11.2 requires `data-invalid` on the field and
 * `aria-invalid` on the control, and §2.3 forbids a state that reads from colour
 * alone.
 */
const COPY = messages.series.create;

const WORKSPACE_ID = "0f1a0f3a-6c4d-4f77-9c0b-1a2b3c4d5e6f";

function created() {
  return {
    status: 201,
    json: async () => ({
      id: "3a2b1c0d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
      name: "Rooftop Confessions",
      revision: 1,
      createdAt: "2026-07-30T09:00:00.000Z",
    }),
  };
}

describe("series create form", () => {
  beforeEach(() => {
    refresh.mockReset();
    post.mockReset();
    post.mockResolvedValue(created());
  });

  it("sends the name to the workspace's series collection", async () => {
    render(<SeriesCreateForm workspaceId={WORKSPACE_ID} />);

    await userEvent.type(screen.getByLabelText(COPY.name.label), "Rooftop Confessions");
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(post).toHaveBeenCalledWith({
      param: { workspaceId: WORKSPACE_ID },
      json: { name: "Rooftop Confessions" },
    });
  });

  it("sends the trimmed name, so a stray space cannot become part of it", async () => {
    render(<SeriesCreateForm workspaceId={WORKSPACE_ID} />);

    await userEvent.type(screen.getByLabelText(COPY.name.label), "  Midnight Diner  ");
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(post).toHaveBeenCalledWith({
      param: { workspaceId: WORKSPACE_ID },
      json: { name: "Midnight Diner" },
    });
  });

  it("empties the field and asks the page to re-read the library", async () => {
    render(<SeriesCreateForm workspaceId={WORKSPACE_ID} />);

    await userEvent.type(screen.getByLabelText(COPY.name.label), "Rooftop Confessions");
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    // The list is rendered by the server component, so a created series only
    // appears once the page re-reads it.
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByLabelText(COPY.name.label)).toHaveValue("");
  });

  it("asks the api for nothing when the name is blank", async () => {
    render(<SeriesCreateForm workspaceId={WORKSPACE_ID} />);

    // Whitespace only: the contract trims before measuring, so this is empty rather
    // than three characters long, and the person is told which.
    await userEvent.type(screen.getByLabelText(COPY.name.label), "   ");
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(COPY.name.errors.required)).toBeInTheDocument();
    expect(screen.getByLabelText(COPY.name.label)).toHaveAttribute("aria-invalid", "true");
  });

  it("refuses a name longer than the contract allows and says which limit", async () => {
    render(<SeriesCreateForm workspaceId={WORKSPACE_ID} />);

    await userEvent.type(screen.getByLabelText(COPY.name.label), "A".repeat(121));
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(COPY.name.errors.tooLong)).toBeInTheDocument();
  });

  it("keeps what was typed and explains it when the api refuses", async () => {
    post.mockResolvedValue({ status: 404, json: async () => ({}) });
    render(<SeriesCreateForm workspaceId={WORKSPACE_ID} />);

    await userEvent.type(screen.getByLabelText(COPY.name.label), "Rooftop Confessions");
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.failed);
    // Retyping a name because a request failed is the kind of small insult that
    // makes people stop trusting a tool.
    expect(screen.getByLabelText(COPY.name.label)).toHaveValue("Rooftop Confessions");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("cannot be submitted twice while the first request is in flight", async () => {
    // There is no idempotency key on this route yet, so a double click would create
    // two series with the same name and no way to tell them apart.
    let release: (() => void) | undefined;
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(created());
        }),
    );

    render(<SeriesCreateForm workspaceId={WORKSPACE_ID} />);
    await userEvent.type(screen.getByLabelText(COPY.name.label), "Rooftop Confessions");
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    const pending = screen.getByRole("button", { name: COPY.pending });
    expect(pending).toBeDisabled();

    await userEvent.click(pending);
    expect(post).toHaveBeenCalledTimes(1);

    release?.();
  });
});
