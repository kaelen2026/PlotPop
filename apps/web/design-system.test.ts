import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static gate for the rules in `docs/design-system.md` §16 that a type checker
 * cannot see. §18 requires CI to reject visual hardcoding in business code, and
 * every rule below quotes the clause it enforces.
 *
 * This scans the Web application's own source. The design system itself lives in
 * `packages/ui` and is exempt: that is where the values are allowed to exist.
 */

const SCANNED_DIRECTORIES = ["app", "components"];
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".css"];

/** §8.1: the approved subset of the 4px scale. `0` removes spacing entirely. */
const APPROVED_SPACING_STEPS = new Set(["0", "1", "2", "3", "4", "6", "8", "12", "16", "24"]);
const SPACING_UTILITIES = "p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y";

type Rule = {
  clause: string;
  pattern: RegExp;
  allow?: (match: string) => boolean;
};

const RULES: Rule[] = [
  {
    clause: "§16 no hardcoded hex colours — use a semantic token",
    pattern: /#[\da-f]{3,8}\b/gi,
  },
  {
    clause: "§16 no hardcoded colour functions — use a semantic token",
    pattern: /\b(?:rgba?|hsla?|oklch|lab|color-mix)\(/gi,
  },
  {
    clause: "§16 no arbitrary visual values — add a token instead",
    pattern:
      /-\[\s*(?:#[\da-f]{3,8}|-?\d*\.?\d+(?:px|rem|em|%|vh|vw|ch|ms|s)?\b|rgba?\(|hsla?\(|oklch\()/gi,
  },
  {
    clause: "§16 use gap-* instead of space-x-* or space-y-*",
    pattern: /\bspace-[xy]-/g,
  },
  {
    clause: "§16 no dark: colour overrides in business code — the token layer handles Dark",
    pattern: /(?<![\w-])dark:/g,
  },
  {
    clause: "§8.2 page layout uses only the md: and xl: breakpoints",
    pattern: /(?<![\w-])(?:sm|lg|2xl):/g,
  },
  {
    clause: "§9.3 no hand written z-index — rely on the component layering",
    pattern: /(?<![\w-])z-\d/g,
  },
  {
    clause: "§8 no negative margins — fix the layout hierarchy instead",
    pattern: /(?<![\w-])-m[xytrbl]?-\d/g,
  },
  {
    clause: "§8.1 spacing uses only the approved steps 1 2 3 4 6 8 12 16 24",
    pattern: new RegExp(`(?<![\\w-])(?:${SPACING_UTILITIES})-(\\d+)(?![\\w-])`, "g"),
    allow: (match) => APPROVED_SPACING_STEPS.has(match.split("-").pop() as string),
  },
];

function sourceFiles(): string[] {
  const files: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (/\.test\.tsx?$/.test(path)) continue;
      if (!SCANNED_EXTENSIONS.some((extension) => path.endsWith(extension))) continue;
      files.push(path);
    }
  };

  for (const directory of SCANNED_DIRECTORIES) {
    const path = new URL(`./${directory}`, import.meta.url).pathname;
    try {
      if (statSync(path).isDirectory()) walk(path);
    } catch {
      // A directory that does not exist yet has nothing to scan.
    }
  }

  return files;
}

describe("design system constraints", () => {
  const files = sourceFiles();

  it("scans the Web application source", () => {
    // A guard that silently scans nothing is worse than no guard at all.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(RULES)("rejects violations of $clause", ({ pattern, allow }) => {
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(pattern)) {
        const text = match[0] as string;
        if (allow?.(text) === true) continue;
        const line = source.slice(0, match.index).split("\n").length;
        violations.push(`${file.split("/apps/web/")[1]}:${line} ${text}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
