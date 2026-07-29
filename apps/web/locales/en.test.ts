import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { messages } from "./en";

/**
 * `docs/design-system.md` §14 keeps every visible string out of components, so
 * the copy a page renders lives here. It is split one module per page or per
 * shared surface because slices land on separate branches: each slice owns its
 * own file and adds a single line to the aggregate in `en.ts`.
 *
 * That seam only holds if a new module is actually reachable from `messages`. A
 * forgotten aggregate line is invisible at the type level — the page importing
 * its own module still compiles — and would only surface as missing copy in the
 * browser. These two tests are the gate.
 */

/** `creator-home.ts` is reachable as `messages.creatorHome`. */
function namespaceFor(fileName: string): string {
  return fileName
    .replace(/\.ts$/, "")
    .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function copyModules(): string[] {
  const directory = new URL(".", import.meta.url).pathname;

  return readdirSync(directory)
    .filter((entry) => entry.endsWith(".ts"))
    .filter((entry) => entry !== "en.ts" && !entry.endsWith(".test.ts"))
    .map(namespaceFor);
}

function stringsIn(value: unknown, path: string): [string, unknown][] {
  if (typeof value !== "object" || value === null) return [[path, value]];

  return Object.entries(value).flatMap(([key, nested]) =>
    stringsIn(nested, path === "" ? key : `${path}.${key}`),
  );
}

describe("english copy", () => {
  it("surfaces every copy module in the aggregate", () => {
    expect(Object.keys(messages).sort()).toEqual(copyModules().sort());
  });

  it("carries no blank or placeholder copy", () => {
    const blank = stringsIn(messages, "")
      .filter(([, value]) => typeof value !== "string" || value.trim() === "")
      .map(([path]) => path);

    expect(blank).toEqual([]);
  });
});
