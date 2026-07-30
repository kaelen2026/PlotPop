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

/**
 * Copy that interpolates is a function, and the gate has to see inside it: a template that
 * reads a value the caller does not pass produces "undefined" in the middle of a sentence,
 * which is exactly the placeholder copy this file exists to catch.
 *
 * The probe is a label and a number, which is every shape copy needs so far — extra
 * arguments are ignored, so one tuple covers each arity.
 */
const COPY_PROBE = ["Ada", 1] as const;

function resolve(value: unknown): unknown {
  if (typeof value !== "function") return value;

  const rendered: unknown = value(...COPY_PROBE);

  // An unfilled slot renders as one of these rather than as an empty string, so a blank
  // check alone would pass it.
  return typeof rendered === "string" && /undefined|NaN|\[object/.test(rendered) ? "" : rendered;
}

function stringsIn(value: unknown, path: string): [string, unknown][] {
  const resolved = resolve(value);

  if (typeof resolved !== "object" || resolved === null) return [[path, resolved]];

  return Object.entries(resolved).flatMap(([key, nested]) =>
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
