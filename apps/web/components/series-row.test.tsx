// @vitest-environment jsdom

import type { Series } from "@plotpop/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/locales/en";
import { SeriesRow } from "./series-row";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const patch = vi.fn();

vi.mock("@/lib/api-client", () => ({
  browserApi: {
    api: {
      v1: {
        workspaces: {
          ":workspaceId": {
            series: { ":seriesId": { $patch: (...args: unknown[]) => patch(...args) } },
          },
        },
      },
    },
  },
}));

/**
 * Renaming a series from its row in the library (§20.6, `docs/design-system.md` §11.2).
 *
 * The api client is the boundary being mocked (`.claude/rules/tdd.md` §6). What is under
 * test is the row: which request it sends, which it refuses to send, and what it tells
 * the person when someone else got there first.
 */
const COPY = messages.series.rename;
const NAME = messages.series.name;

const WORKSPACE_ID = "0f1a0f3a-6c4d-4f77-9c0b-1a2b3c4d5e6f";

const SERIES: Series = {
  id: "3a2b1c0d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
  name: "Rooftop Confessions",
  revision: 3,
  createdAt: "2026-07-30T09:00:00.000Z",
};

function renamed(name: string, revision: number) {
  return { status: 200, json: async () => ({ ...SERIES, name, revision }) };
}

function row(series: Series = SERIES) {
  return render(
    <ul>
      <SeriesRow series={series} workspaceId={WORKSPACE_ID} />
    </ul>,
  );
}

async function startRenaming(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: COPY.action }));
}

describe("series row", () => {
  beforeEach(() => {
    refresh.mockReset();
    patch.mockReset();
    patch.mockResolvedValue(renamed("Rooftop Confessions, Season One", 4));
  });

  it("shows the name until asked to rename it", () => {
    row();

    expect(screen.getByText(SERIES.name)).toBeInTheDocument();
    expect(screen.queryByLabelText(NAME.label)).not.toBeInTheDocument();
  });

  it("opens with the current name in the field, ready to type over", async () => {
    row();
    await startRenaming();

    const field = screen.getByLabelText(NAME.label);

    expect(field).toHaveValue(SERIES.name);
    // Focus moves to the field: §15 requires a continuous keyboard path, and a form
    // that opens somewhere behind the caret is one the keyboard cannot reach.
    expect(field).toHaveFocus();
  });

  it("sends the new name with the revision it was given", async () => {
    row();
    await startRenaming();

    await userEvent.clear(screen.getByLabelText(NAME.label));
    await userEvent.type(screen.getByLabelText(NAME.label), "Rooftop Confessions, Season One");
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    // §20.6: the revision the row was rendered with is what makes this update
    // conditional rather than a blind overwrite.
    expect(patch).toHaveBeenCalledWith({
      param: { workspaceId: WORKSPACE_ID, seriesId: SERIES.id },
      json: { name: "Rooftop Confessions, Season One", revision: SERIES.revision },
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("closes the form and leaves the row alone when cancelled", async () => {
    row();
    await startRenaming();

    await userEvent.clear(screen.getByLabelText(NAME.label));
    await userEvent.type(screen.getByLabelText(NAME.label), "Abandoned");
    await userEvent.click(screen.getByRole("button", { name: COPY.cancel }));

    expect(patch).not.toHaveBeenCalled();
    expect(screen.getByText(SERIES.name)).toBeInTheDocument();
    expect(screen.queryByLabelText(NAME.label)).not.toBeInTheDocument();
  });

  it("asks the api for nothing when the name is emptied", async () => {
    row();
    await startRenaming();

    await userEvent.clear(screen.getByLabelText(NAME.label));
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(patch).not.toHaveBeenCalled();
    expect(screen.getByText(NAME.errors.required)).toBeInTheDocument();
    expect(screen.getByLabelText(NAME.label)).toHaveAttribute("aria-invalid", "true");
  });

  /*
   * The conflict the whole revision exists for. What matters is that the person is told
   * someone else changed it, keeps what they typed, and is offered the one recovery that
   * works — reading it again. Refreshing behind their back would throw away their text.
   */
  it("explains a conflict, keeps the typed name and offers a reload", async () => {
    patch.mockResolvedValue({ status: 409, json: async () => ({}) });
    row();
    await startRenaming();

    await userEvent.clear(screen.getByLabelText(NAME.label));
    await userEvent.type(screen.getByLabelText(NAME.label), "From A Stale Tab");
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.conflict);
    expect(screen.getByLabelText(NAME.label)).toHaveValue("From A Stale Tab");
    expect(refresh).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: COPY.reload }));
    expect(refresh).toHaveBeenCalled();
  });

  it("explains any other refusal without inventing a reason", async () => {
    patch.mockResolvedValue({ status: 404, json: async () => ({}) });
    row();
    await startRenaming();

    await userEvent.clear(screen.getByLabelText(NAME.label));
    await userEvent.type(screen.getByLabelText(NAME.label), "Gone");
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.failed);
    expect(screen.queryByRole("button", { name: COPY.reload })).not.toBeInTheDocument();
  });

  it("cannot be saved twice while the first request is in flight", async () => {
    let release: (() => void) | undefined;
    patch.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(renamed("Once", 4));
        }),
    );

    row();
    await startRenaming();
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    const pending = screen.getByRole("button", { name: COPY.pending });
    expect(pending).toBeDisabled();

    await userEvent.click(pending);
    expect(patch).toHaveBeenCalledTimes(1);

    release?.();
  });
});
