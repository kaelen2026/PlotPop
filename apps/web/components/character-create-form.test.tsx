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
    uploadAsset.mockReset();
    post.mockResolvedValue(created());
  });

  it("sends the name and the appearance to the series' cast", async () => {
    form();

    await userEvent.type(screen.getByLabelText(COPY.name.label), "Ada");
    await userEvent.type(screen.getByLabelText(COPY.appearance.label), APPEARANCE);
    await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

    expect(post).toHaveBeenCalledWith({
      param: { workspaceId: WORKSPACE_ID, seriesId: SERIES_ID },
      // The empty list is stated rather than omitted: it comes from the contract's own
      // default, so the api is never left to guess what "no images" meant.
      json: { name: "Ada", appearance: APPEARANCE, referenceAssetIds: [] },
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

  /**
   * Reference images on the first version (§32.1).
   *
   * The gap this closes: until now a character could only get a photograph by being created
   * from words and then edited, because the upload lived on the edit form alone. The ordering
   * is the same either way — an asset is uploaded and confirmed before the version that
   * references it exists, since a version row is never rewritten.
   */
  describe("reference images", () => {
    const ASSET_ID = "6d0b2f19-3a5c-4e8e-9b2a-71f0c4d5e6a7";
    const IMAGE_COPY = messages.series.cast.referenceImages;

    function pngFile(): File {
      return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "ada.png", {
        type: "image/png",
      });
    }

    async function chooseImage(): Promise<void> {
      await userEvent.click(screen.getByLabelText(IMAGE_COPY.rights));
      await userEvent.upload(screen.getByLabelText(IMAGE_COPY.label), pngFile());
    }

    it("will not upload before the right to use the file is confirmed", async () => {
      // §195, §733. Disabled rather than validated afterwards, so nothing is ever sent
      // without the confirmation existing first.
      form();

      expect(screen.getByLabelText(IMAGE_COPY.label)).toBeDisabled();

      await userEvent.click(screen.getByLabelText(IMAGE_COPY.rights));

      expect(screen.getByLabelText(IMAGE_COPY.label)).toBeEnabled();
      expect(uploadAsset).not.toHaveBeenCalled();
    });

    it("pins the uploaded image to the character's first version", async () => {
      uploadAsset.mockResolvedValue({ outcome: "uploaded", assetId: ASSET_ID });
      form();

      await userEvent.type(screen.getByLabelText(COPY.name.label), "Ada");
      await userEvent.type(screen.getByLabelText(COPY.appearance.label), APPEARANCE);
      await chooseImage();

      expect(uploadAsset).toHaveBeenCalledWith(expect.any(File), { workspaceId: WORKSPACE_ID });

      await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

      expect(post).toHaveBeenCalledWith({
        param: { workspaceId: WORKSPACE_ID, seriesId: SERIES_ID },
        json: { name: "Ada", appearance: APPEARANCE, referenceAssetIds: [ASSET_ID] },
      });
    });

    it("describes an image chosen before the name is typed", async () => {
      /*
       * The alternative text cannot name a character that has none yet, and "Reference image 1
       * for " with nothing after it is worse than a generic phrase.
       */
      uploadAsset.mockResolvedValue({ outcome: "uploaded", assetId: ASSET_ID });
      form();

      await chooseImage();

      expect(await screen.findByAltText(IMAGE_COPY.altNew(1))).toBeInTheDocument();
    });

    it("empties the images along with the fields, so the next character starts clean", async () => {
      // A second character inheriting the first one's photograph is the kind of mistake
      // nobody would look for.
      uploadAsset.mockResolvedValue({ outcome: "uploaded", assetId: ASSET_ID });
      form();

      await userEvent.type(screen.getByLabelText(COPY.name.label), "Ada");
      await userEvent.type(screen.getByLabelText(COPY.appearance.label), APPEARANCE);
      await chooseImage();
      await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

      expect(screen.queryByAltText(IMAGE_COPY.alt("Ada", 1))).not.toBeInTheDocument();
      expect(screen.queryByAltText(IMAGE_COPY.altNew(1))).not.toBeInTheDocument();
    });

    it("keeps the image when the request fails, like it keeps the typed fields", async () => {
      // The upload already succeeded; making the creator do it again because the character
      // insert failed would be charging them for our problem.
      uploadAsset.mockResolvedValue({ outcome: "uploaded", assetId: ASSET_ID });
      post.mockResolvedValue({ status: 500, json: async () => ({}) });
      form();

      await userEvent.type(screen.getByLabelText(COPY.name.label), "Ada");
      await userEvent.type(screen.getByLabelText(COPY.appearance.label), APPEARANCE);
      await chooseImage();
      await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

      expect(await screen.findByRole("alert")).toHaveTextContent(COPY.failed);
      expect(screen.getByAltText(IMAGE_COPY.alt("Ada", 1))).toBeInTheDocument();
    });

    it("says which kind of file was refused, and creates nothing with it", async () => {
      uploadAsset.mockResolvedValue({ outcome: "failed", reason: "unsupported" });
      form();

      await userEvent.type(screen.getByLabelText(COPY.name.label), "Ada");
      await userEvent.type(screen.getByLabelText(COPY.appearance.label), APPEARANCE);
      await chooseImage();

      expect(await screen.findByText(IMAGE_COPY.errors.unsupported)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: COPY.submit }));

      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({ json: expect.objectContaining({ referenceAssetIds: [] }) }),
      );
    });
  });
});
