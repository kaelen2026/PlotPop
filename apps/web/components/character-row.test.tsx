// @vitest-environment jsdom

import type { Character } from "@plotpop/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/locales/en";
import { CharacterRow } from "./character-row";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const post = vi.fn();
const get = vi.fn();
const uploadAsset = vi.fn();

vi.mock("@/lib/asset-upload", () => ({
  uploadAsset: (...args: unknown[]) => uploadAsset(...args),
}));

vi.mock("@/lib/api-client", () => ({
  browserApi: {
    api: {
      v1: {
        workspaces: {
          ":workspaceId": {
            series: {
              ":seriesId": {
                characters: {
                  ":characterId": {
                    versions: {
                      $post: (...args: unknown[]) => post(...args),
                      $get: (...args: unknown[]) => get(...args),
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}));

/**
 * One character in a series' cast, and the two things a creator does to it: read what it
 * looks like now, and change that without losing what it looked like before (§32.7).
 *
 * The api client is the boundary being mocked (`.claude/rules/tdd.md` §6).
 */
const COPY = messages.series.cast;

const WORKSPACE_ID = "0f1a0f3a-6c4d-4f77-9c0b-1a2b3c4d5e6f";
const SERIES_ID = "3a2b1c0d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";

const FIRST = "Mid twenties, cropped black hair, round glasses.";
const SECOND = "Now with a shaved head and a leather jacket.";

const IMAGE = {
  assetId: "6d0b2f19-3a5c-4e8e-9b2a-71f0c4d5e6a7",
  contentType: "image/png",
  url: "https://storage.test/source/w/a?signature=abc",
  expiresAt: "2036-07-30T09:15:00.000Z",
} as const;

const CHARACTER: Character = {
  id: "4b3c2d1e-5f60-4b7c-9d0e-1f2a3b4c5d6e",
  name: "Ada",
  revision: 2,
  createdAt: "2026-07-30T09:00:00.000Z",
  currentVersion: {
    version: 2,
    appearance: SECOND,
    referenceImages: [],
    createdAt: "2026-07-30T10:00:00.000Z",
  },
};

/** The same character, with a reference image already on its current version. */
const WITH_IMAGE: Character = {
  ...CHARACTER,
  currentVersion: { ...CHARACTER.currentVersion, referenceImages: [IMAGE] },
};

function versioned() {
  return {
    status: 201,
    json: async () => ({
      ...CHARACTER,
      revision: 3,
      currentVersion: {
        version: 3,
        appearance: "A third look.",
        createdAt: "2026-07-30T11:00:00.000Z",
      },
    }),
  };
}

function history() {
  return {
    status: 200,
    json: async () => ({
      versions: [
        {
          version: 2,
          appearance: SECOND,
          referenceImages: [],
          createdAt: "2026-07-30T10:00:00.000Z",
        },
        {
          version: 1,
          appearance: FIRST,
          // What version 1 was generated from, which is what §32.7 keeps the history for.
          referenceImages: [IMAGE],
          createdAt: "2026-07-30T09:00:00.000Z",
        },
      ],
    }),
  };
}

function row(character: Character = CHARACTER) {
  return render(
    <ul>
      <CharacterRow character={character} seriesId={SERIES_ID} workspaceId={WORKSPACE_ID} />
    </ul>,
  );
}

async function startEditing(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: COPY.update.action }));
}

describe("character row", () => {
  beforeEach(() => {
    refresh.mockReset();
    post.mockReset();
    get.mockReset();
    uploadAsset.mockReset();
    post.mockResolvedValue(versioned());
    get.mockResolvedValue(history());
  });

  it("shows the name, the current version and what it looks like", () => {
    row();

    expect(screen.getByText(CHARACTER.name)).toBeInTheDocument();
    expect(screen.getByText(`${COPY.version} 2`)).toBeInTheDocument();
    expect(screen.getByText(SECOND)).toBeInTheDocument();
  });

  it("opens the editor with the current appearance, ready to change", async () => {
    row();
    await startEditing();

    const field = screen.getByLabelText(COPY.create.appearance.label);

    expect(field).toHaveValue(SECOND);
    // §15: the keyboard path follows the form that just opened.
    expect(field).toHaveFocus();
  });

  it("sends the new appearance with the revision it was given", async () => {
    row();
    await startEditing();

    await userEvent.clear(screen.getByLabelText(COPY.create.appearance.label));
    await userEvent.type(screen.getByLabelText(COPY.create.appearance.label), "A third look.");
    await userEvent.click(screen.getByRole("button", { name: COPY.update.submit }));

    // §20.6: the revision the row was rendered with is what makes this conditional on the
    // appearance the person actually read.
    expect(post).toHaveBeenCalledWith({
      param: {
        workspaceId: WORKSPACE_ID,
        seriesId: SERIES_ID,
        characterId: CHARACTER.id,
      },
      /*
       * The images this version pins are stated in full, because a version is a snapshot
       * rather than a change to the last one. This character has none, so the list is empty;
       * the case where it carries the existing ones forward has its own test.
       */
      json: {
        appearance: "A third look.",
        revision: CHARACTER.revision,
        referenceAssetIds: [],
      },
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("asks the api for nothing when the appearance is emptied", async () => {
    row();
    await startEditing();

    await userEvent.clear(screen.getByLabelText(COPY.create.appearance.label));
    await userEvent.click(screen.getByRole("button", { name: COPY.update.submit }));

    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(COPY.create.appearance.errors.required)).toBeInTheDocument();
  });

  it("closes the editor and changes nothing when cancelled", async () => {
    row();
    await startEditing();

    await userEvent.clear(screen.getByLabelText(COPY.create.appearance.label));
    await userEvent.type(screen.getByLabelText(COPY.create.appearance.label), "Abandoned.");
    await userEvent.click(screen.getByRole("button", { name: COPY.update.cancel }));

    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(SECOND)).toBeInTheDocument();
  });

  it("explains a conflict, keeps the typed appearance and offers a reload", async () => {
    post.mockResolvedValue({ status: 409, json: async () => ({}) });
    row();
    await startEditing();

    await userEvent.clear(screen.getByLabelText(COPY.create.appearance.label));
    await userEvent.type(screen.getByLabelText(COPY.create.appearance.label), "From a stale tab.");
    await userEvent.click(screen.getByRole("button", { name: COPY.update.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.update.conflict);
    expect(screen.getByLabelText(COPY.create.appearance.label)).toHaveValue("From a stale tab.");
    expect(refresh).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: COPY.update.reload }));
    expect(refresh).toHaveBeenCalled();
  });

  /*
   * The history is what makes the version split visible. Without it a creator has to take
   * on faith that the old appearance still exists, which is exactly the thing §32.7 is
   * protecting.
   */
  it("reads the earlier versions when asked, and puts them away again", async () => {
    row();

    await userEvent.click(screen.getByRole("button", { name: COPY.history.show }));

    expect(get).toHaveBeenCalledWith({
      param: { workspaceId: WORKSPACE_ID, seriesId: SERIES_ID, characterId: CHARACTER.id },
    });

    const versions = await screen.findByRole("list", { name: COPY.history.heading });
    expect(versions).toHaveTextContent(FIRST);
    expect(versions).toHaveTextContent(`${COPY.version} 1`);

    await userEvent.click(screen.getByRole("button", { name: COPY.history.hide }));
    expect(screen.queryByRole("list", { name: COPY.history.heading })).not.toBeInTheDocument();
  });

  it("says so when the history cannot be read", async () => {
    get.mockResolvedValue({ status: 404, json: async () => ({}) });
    row();

    await userEvent.click(screen.getByRole("button", { name: COPY.history.show }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.history.failed);
  });

  it("says plainly when there is only the first version", async () => {
    get.mockResolvedValue({
      status: 200,
      json: async () => ({
        versions: [
          {
            version: 1,
            appearance: FIRST,
            referenceImages: [],
            createdAt: "2026-07-30T09:00:00.000Z",
          },
        ],
      }),
    });
    row({
      ...CHARACTER,
      revision: 1,
      currentVersion: {
        version: 1,
        appearance: FIRST,
        referenceImages: [],
        createdAt: "2026-07-30T09:00:00.000Z",
      },
    });

    await userEvent.click(screen.getByRole("button", { name: COPY.history.show }));

    // The only version is the one already on screen, so a list of it would say nothing.
    expect(await screen.findByText(COPY.history.only)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: COPY.history.heading })).not.toBeInTheDocument();
  });

  /**
   * Reference images (§32.1, §32.7).
   *
   * The behaviour worth pinning is the one a creator cannot see going wrong: a version states
   * its images in full, so an appearance edit that forgot to resend them would silently throw
   * away every photograph they had uploaded.
   */
  describe("reference images", () => {
    const NEW_ASSET_ID = "8a1c4e57-2b6d-4f91-83c5-04e7b2a1d9f3";

    function pngFile(name = "ada.png"): File {
      return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
    }

    async function startEditingWith(character: Character): Promise<void> {
      row(character);
      await userEvent.click(screen.getByRole("button", { name: COPY.update.action }));
    }

    it("shows the current version's images, named after the character", async () => {
      row(WITH_IMAGE);

      // Not "reference image": someone moving down a cast of ten by screen reader would hear
      // the same phrase ten times and learn nothing.
      const image = screen.getByAltText(COPY.referenceImages.alt("Ada", 1));

      expect(image).toHaveAttribute("src", IMAGE.url);
    });

    it("carries the existing images into the version it saves", async () => {
      /*
       * The silent data loss this exists to prevent. The creator edited words, not images, so
       * the new version has to pin what the old one did — nothing on screen would tell them
       * otherwise until an episode came back without the reference.
       */
      await startEditingWith(WITH_IMAGE);

      await userEvent.clear(screen.getByLabelText(COPY.create.appearance.label));
      await userEvent.type(screen.getByLabelText(COPY.create.appearance.label), "A third look.");
      await userEvent.click(screen.getByRole("button", { name: COPY.update.submit }));

      expect(post).toHaveBeenCalledWith({
        param: { workspaceId: WORKSPACE_ID, seriesId: SERIES_ID, characterId: CHARACTER.id },
        json: {
          appearance: "A third look.",
          revision: CHARACTER.revision,
          referenceAssetIds: [IMAGE.assetId],
        },
      });
    });

    it("drops an image only when it is removed on purpose", async () => {
      await startEditingWith(WITH_IMAGE);

      await userEvent.click(screen.getByRole("button", { name: COPY.referenceImages.remove }));
      await userEvent.click(screen.getByRole("button", { name: COPY.update.submit }));

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ json: expect.objectContaining({ referenceAssetIds: [] }) }),
      );
    });

    it("will not upload before the right to use the file is confirmed", async () => {
      // §195, §733. Disabled rather than validated afterwards, so nothing is ever sent
      // without the confirmation existing first.
      await startEditingWith(CHARACTER);

      expect(screen.getByLabelText(COPY.referenceImages.label)).toBeDisabled();

      await userEvent.click(screen.getByLabelText(COPY.referenceImages.rights));

      expect(screen.getByLabelText(COPY.referenceImages.label)).toBeEnabled();
    });

    it("uploads the chosen file and pins it to the version being saved", async () => {
      uploadAsset.mockResolvedValue({ outcome: "uploaded", assetId: NEW_ASSET_ID });
      await startEditingWith(CHARACTER);

      await userEvent.click(screen.getByLabelText(COPY.referenceImages.rights));
      await userEvent.upload(screen.getByLabelText(COPY.referenceImages.label), pngFile());

      // Uploaded before the version is saved, because a version row is never rewritten and
      // so cannot have an image attached after the fact.
      expect(uploadAsset).toHaveBeenCalledWith(expect.any(File), { workspaceId: WORKSPACE_ID });

      await userEvent.click(screen.getByRole("button", { name: COPY.update.submit }));

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          json: expect.objectContaining({ referenceAssetIds: [NEW_ASSET_ID] }),
        }),
      );
    });

    it("says which kind of file was refused, and saves nothing", async () => {
      // A renamed photograph is the common case, and "something went wrong" would leave the
      // creator with no idea which file to change.
      uploadAsset.mockResolvedValue({ outcome: "failed", reason: "unsupported" });
      await startEditingWith(CHARACTER);

      await userEvent.click(screen.getByLabelText(COPY.referenceImages.rights));
      await userEvent.upload(
        screen.getByLabelText(COPY.referenceImages.label),
        pngFile("photo.png"),
      );

      expect(await screen.findByText(COPY.referenceImages.errors.unsupported)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: COPY.update.submit }));

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ json: expect.objectContaining({ referenceAssetIds: [] }) }),
      );
    });

    it("shows what an earlier version was generated from", async () => {
      // The history is only worth keeping if it says what the older episode looked at, not
      // merely what it was described as (§32.7).
      row(CHARACTER);

      await userEvent.click(screen.getByRole("button", { name: COPY.history.show }));

      const versions = await screen.findByRole("list", { name: COPY.history.heading });

      expect(versions).toContainElement(screen.getByAltText(COPY.referenceImages.alt("Ada", 1)));
    });
  });
});
