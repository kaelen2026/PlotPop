import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static gate for how a base component is allowed to express a selected state.
 *
 * `apps/web/design-system.test.ts` deliberately exempts `packages/ui` — this is
 * where colour values are allowed to exist. That exemption is not a licence to
 * improvise a state, and nothing else checks it: `theme.test.ts` verifies the
 * values in `theme.css` and never reads a component, so a component that mixes
 * its own colour is invisible to both.
 *
 * The rules below are narrow on purpose. They cover the selected state, where
 * `docs/design-system.md` §6.2 already names the colour (`accent`, "强调与选中"),
 * so a component reaching for anything else is contradicting a decision rather
 * than filling a gap. `toggle.tsx` is the precedent: `data-[state=on]:bg-accent`.
 *
 * Hover, Pressed and Disabled are **not** covered, because §4.2 promises those
 * tokens and §6 never gives them values. Components currently express them with
 * `/90` opacity mixes and `opacity-50`. Gating that before the tokens exist would
 * only force the improvisation somewhere less visible; see §4.2.
 */

const COMPONENTS = new URL("./", import.meta.url).pathname;
const SCANNED_EXTENSIONS = [".ts", ".tsx"];

/** The selectors a component uses to say "this one is chosen". */
const SELECTED_STATE =
  /(?:data-\[state=(?:checked|on)\]|aria-\[?selected|aria-\[?pressed|data-\[selected)/;

/** A utility that paints something, as opposed to laying it out. */
const COLOUR_UTILITY = /\b(?:bg|text|border|ring|fill|stroke|outline|decoration|shadow)-/;

type Rule = {
  clause: string;
  /** True when this class is a violation. */
  violates: (className: string) => boolean;
};

const RULES: Rule[] = [
  {
    clause:
      "§6.2 a selected state uses the accent token — see data-[state=on]:bg-accent in toggle.tsx",
    violates: (className) =>
      SELECTED_STATE.test(className) &&
      COLOUR_UTILITY.test(className) &&
      !/\baccent\b/.test(className),
  },
  {
    clause:
      "§6.6 a selected state may not be an opacity mix — the value would never be contrast verified",
    violates: (className) =>
      SELECTED_STATE.test(className) && COLOUR_UTILITY.test(className) && /\/\d+\b/.test(className),
  },
  {
    clause:
      "§5.3/§5.4 a selected state may not be overridden per theme — a token that needs dark: is not tokenised",
    violates: (className) =>
      SELECTED_STATE.test(className) &&
      COLOUR_UTILITY.test(className) &&
      /(?<![\w-])dark:/.test(className),
  },
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!SCANNED_EXTENSIONS.some((extension) => entry.endsWith(extension))) return [];
    if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) return [];

    return [path];
  });
}

/**
 * Tailwind classes are whitespace separated inside string literals, so splitting
 * on whitespace is enough to judge each one on its own. A rule has to see the
 * whole class — `dark:has-data-[state=checked]:bg-primary/10` is one utility, and
 * its state selector, its opacity and its theme prefix are all in that one token.
 */
function classesIn(source: string): string[] {
  return source.split(/[\s`'"]+/).filter((candidate) => candidate.includes("-"));
}

describe("base component state expression", () => {
  const files = sourceFiles(COMPONENTS);

  it("scans the component sources", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const rule of RULES) {
    it(rule.clause, () => {
      const violations = files.flatMap((path) =>
        classesIn(readFileSync(path, "utf8"))
          .filter((className) => rule.violates(className))
          .map((className) => `${path.replace(COMPONENTS, "")}: ${className}`),
      );

      expect(violations).toEqual([]);
    });
  }
});
