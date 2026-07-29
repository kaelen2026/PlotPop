import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Contrast gate for the design tokens in `theme.css`.
 *
 * `docs/design-system.md` §6.6 requires every Light and Dark colour pair to be
 * re-verified whenever any value changes, because the surface ladder and the
 * status colours all measure against the same Canvas — moving one background
 * silently moves a dozen ratios. §18 requires that check to run in CI, and
 * §6.6 records that the one-off script which produced the documented values is
 * superseded by this test once it exists.
 *
 * The test reads the shipped stylesheet rather than a duplicated table of hex
 * values, so there is exactly one place where a colour is defined.
 */

const themeCss = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

const PRIMITIVE_SELECTOR = ":root";
const LIGHT_SELECTOR = ":root, :root[data-theme='light']";
const DARK_SELECTOR = ":root[data-theme='dark']";
const REDUCED_MOTION_SELECTOR = "@media (prefers-reduced-motion: reduce)";

type Theme = "light" | "dark";

/** Every top-level `selector { … }` block, with nested blocks left untouched. */
function topLevelBlocks(css: string): { selector: string; body: string }[] {
  const blocks: { selector: string; body: string }[] = [];
  let selectorStart = 0;
  let bodyStart = 0;
  let depth = 0;

  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      depth += 1;
      if (depth === 1) bodyStart = index + 1;
      continue;
    }
    if (character !== "}") continue;
    depth -= 1;
    if (depth > 0) continue;
    blocks.push({
      selector: normaliseSelector(css.slice(selectorStart, bodyStart - 1)),
      body: css.slice(bodyStart, index),
    });
    selectorStart = index + 1;
  }

  return blocks;
}

/** Drops comments and the preceding statements, e.g. `@import` and `@custom-variant`. */
function normaliseSelector(raw: string): string {
  const withoutComments = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  const afterStatements = withoutComments.slice(withoutComments.lastIndexOf(";") + 1);
  return afterStatements.replace(/\s+/g, " ").replace(/"/g, "'").trim();
}

function declaredProperties(body: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    declarations.set(name as string, (value as string).trim());
  }
  return declarations;
}

function blockBody(selector: string): string {
  return topLevelBlocks(themeCss)
    .filter((block) => block.selector === selector)
    .map((block) => block.body)
    .join("\n");
}

function customProperties(selector: string): Map<string, string> {
  return declaredProperties(blockBody(selector));
}

const primitives = customProperties(PRIMITIVE_SELECTOR);
const lightDeclarations = customProperties(LIGHT_SELECTOR);
const darkDeclarations = customProperties(DARK_SELECTOR);
const themeDeclarations = new Map([
  ...customProperties("@theme"),
  ...customProperties("@theme inline"),
]);

/** Semantic tokens resolve through the primitive layer, so both are in scope. */
function declarationsFor(theme: Theme): Map<string, string> {
  return new Map([...primitives, ...(theme === "light" ? lightDeclarations : darkDeclarations)]);
}

/** Resolves a semantic token through the primitive layer down to a hex value. */
function resolveColour(token: string, theme: Theme): string {
  let value = declarationsFor(theme).get(`--${token}`);
  if (value === undefined)
    throw new Error(`token --${token} is not defined for the ${theme} theme`);

  for (let hop = 0; hop < 8; hop += 1) {
    const reference = /^var\((--[\w-]+)\)$/.exec(value);
    if (reference === null) return value;
    const name = reference[1] as string;
    const next = declarationsFor(theme).get(name);
    if (next === undefined) throw new Error(`${value} referenced by --${token} is not defined`);
    value = next;
  }

  throw new Error(`--${token} does not resolve to a value in the ${theme} theme`);
}

function relativeLuminance(hex: string): number {
  const match = /^#([\da-f]{6})$/i.exec(hex);
  if (match === null) throw new Error(`${hex} is not a six digit sRGB hex value`);
  const digits = match[1] as string;
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(digits.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Text pairs need 4.5:1 (§6.6). `border` is deliberately absent from the
 * non-text list: §6.3 keeps `border` decorative and `input` load-bearing
 * precisely so that only `input` carries the 3:1 obligation.
 */
const TEXT_PAIRS: [foreground: string, background: string][] = [
  ["foreground", "background"],
  ["foreground", "surface"],
  ["foreground", "surface-raised"],
  ["foreground", "surface-sunken"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "background"],
  ["muted-foreground", "surface"],
  ["muted-foreground", "surface-raised"],
  ["muted-foreground", "surface-sunken"],
  ["muted-foreground", "muted"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["success-foreground", "success"],
  ["warning-foreground", "warning"],
  ["info-foreground", "info"],
  ["preview-foreground", "preview"],
];

/**
 * §6.7: `brand-lime` and `brand-yellow` are fill-only in Light and carry
 * `brand-ink` text. These pairs are Light only because `brand-ink` is the comic
 * ink there and the warm white foreground in Dark, where §5.4 keeps the bright
 * brand colours for text and small accents rather than large fills.
 */
const LIGHT_FILL_PAIRS: [foreground: string, background: string][] = [
  ["brand-ink", "brand-lime"],
  ["brand-ink", "brand-yellow"],
];

/** Non-text UI boundaries need 3:1 (WCAG 2.2 SC 1.4.11, §6.6). */
const NON_TEXT_PAIRS: [foreground: string, background: string][] = [
  ["input", "background"],
  ["input", "surface"],
  ["input", "surface-raised"],
  ["ring", "background"],
  ["ring", "surface"],
  ["ring", "surface-raised"],
  ["primary", "background"],
  ["primary", "surface"],
  ["accent", "background"],
  ["accent", "surface"],
  ["destructive", "background"],
  ["destructive", "surface"],
  ["success", "background"],
  ["success", "surface"],
  ["warning", "background"],
  ["warning", "surface"],
  ["info", "background"],
  ["info", "surface"],
];

/**
 * Brand colours used as text need 4.5:1 (§6.7). Light keeps `brand-lime` and
 * `brand-yellow` out of this list because they are fill-only there — their
 * boundary comes from the mandatory `stroke-ink`, not from the fill.
 */
const BRAND_TEXT_COLOURS: Record<Theme, string[]> = {
  light: ["brand-pink", "brand-blue"],
  dark: ["brand-pink", "brand-blue", "brand-lime", "brand-yellow"],
};

const BRAND_TEXT_BACKGROUNDS = ["background", "surface", "surface-raised"];

const THEMES: Theme[] = ["light", "dark"];

function pairsFor(theme: Theme): { pair: [string, string]; floor: number }[] {
  return [
    ...TEXT_PAIRS.map((pair) => ({ pair, floor: 4.5 })),
    ...NON_TEXT_PAIRS.map((pair) => ({ pair, floor: 3 })),
    ...(theme === "light" ? LIGHT_FILL_PAIRS.map((pair) => ({ pair, floor: 4.5 })) : []),
    ...BRAND_TEXT_COLOURS[theme].flatMap((colour) =>
      BRAND_TEXT_BACKGROUNDS.map((background) => ({
        pair: [colour, background] as [string, string],
        floor: 4.5,
      })),
    ),
  ];
}

describe("theme tokens", () => {
  it("defines every semantic token in both Light and Dark", () => {
    // A token defined in only one theme renders as unset in the other, which
    // shows up as an invisible element rather than a build failure.
    const missingInDark = [...lightDeclarations.keys()].filter(
      (name) => !darkDeclarations.has(name),
    );
    const extraInDark = [...darkDeclarations.keys()].filter((name) => !lightDeclarations.has(name));

    expect(lightDeclarations.size).toBeGreaterThan(0);
    expect({ missingInDark, extraInDark }).toEqual({ missingInDark: [], extraInDark: [] });
  });

  it("keeps the primitive layer out of the semantic layer", () => {
    // §4.1: business code must not reach a raw scale value, so primitives are
    // never exposed as `--color-*` utilities.
    const exposedPrimitives = [...themeDeclarations.entries()].filter(([, value]) =>
      value.includes("var(--pp-"),
    );
    expect(exposedPrimitives).toEqual([]);
    expect([...primitives.keys()].every((name) => name.startsWith("--pp-"))).toBe(true);
  });

  it("resolves every semantic colour token through the primitive layer", () => {
    for (const theme of THEMES) {
      for (const [foreground, background] of [...TEXT_PAIRS, ...NON_TEXT_PAIRS]) {
        expect(resolveColour(foreground, theme)).toMatch(/^#[\da-f]{6}$/i);
        expect(resolveColour(background, theme)).toMatch(/^#[\da-f]{6}$/i);
      }
    }
  });

  it.each(THEMES)("meets WCAG 2.2 AA for every %s pair", (theme) => {
    const failures = pairsFor(theme)
      .map(({ pair: [foreground, background], floor }) => ({
        pair: `${foreground} on ${background}`,
        ratio: Number(
          contrastRatio(resolveColour(foreground, theme), resolveColour(background, theme)).toFixed(
            2,
          ),
        ),
        floor,
      }))
      .filter(({ ratio, floor }) => ratio < floor);

    expect(failures).toEqual([]);
  });

  it("keeps the media preview neutral in both themes", () => {
    // §5.4 and §13: the preview surface must not pick up theme tint, otherwise
    // the user judges the rendered episode against a coloured backdrop.
    expect(resolveColour("preview-foreground", "light")).toBe(
      resolveColour("preview-foreground", "dark"),
    );
    for (const theme of THEMES) {
      expect(relativeLuminance(resolveColour("preview", theme))).toBeLessThan(0.02);
    }
  });

  it("drops the comic drop shadows in Dark", () => {
    // §9.3: `shadow-pop-*` is Light only; Dark expresses elevation through the
    // three step surface ladder and `border` instead.
    expect(darkDeclarations.get("--elevation-pop-sm")).toBe("none");
    expect(darkDeclarations.get("--elevation-pop-md")).toBe("none");
    expect(lightDeclarations.get("--elevation-pop-sm")).toContain("var(--brand-ink)");
  });

  it("softens the comic stroke colour in Dark", () => {
    // §9.2: Dark swaps the ink stroke for the semantic border to cut edge noise.
    expect(lightDeclarations.get("--stroke-ink-color")).toBe("var(--brand-ink)");
    expect(darkDeclarations.get("--stroke-ink-color")).toBe("var(--border)");
  });

  it("exposes every documented scale as a utility token", () => {
    // §7.2, §9.1, §8.3 and §10 are closed sets: a step that is absent here is a
    // step a page will reach for with an arbitrary value instead.
    const typeSteps = [
      "display-lg",
      "display-md",
      "display-sm",
      "heading-lg",
      "heading-md",
      "heading-sm",
      "heading-xs",
      "body-lg",
      "body-md",
      "body-sm",
      "label-md",
      "label-sm",
      "label-xs",
      "mono-md",
      "mono-sm",
    ];

    const required = [
      ...["display", "sans", "mono"].map((family) => `--font-${family}`),
      ...typeSteps.flatMap((step) => [
        `--text-${step}`,
        `--text-${step}--line-height`,
        `--text-${step}--font-weight`,
      ]),
      ...["sm", "md", "lg", "pill"].map((step) => `--radius-${step}`),
      ...["prose", "form", "app", "marketing"].map((width) => `--container-${width}`),
      ...["out", "emphasized", "exit"].map((curve) => `--ease-${curve}`),
      ...["pop-sm", "pop-md", "raised", "overlay"].map((elevation) => `--shadow-${elevation}`),
    ];

    expect(required.filter((token) => !themeDeclarations.has(token))).toEqual([]);
  });

  it("exposes the named durations as utilities", () => {
    // Tailwind has no duration theme namespace, so §10's steps only reach
    // business code if these utilities exist.
    for (const step of ["instant", "fast", "normal", "slow"]) {
      expect(primitives.has(`--pp-duration-${step}`)).toBe(true);
      expect(themeCss).toContain(`@utility duration-${step} {`);
    }
    for (const stroke of ["hairline", "ink", "ink-bold"]) {
      expect(themeCss).toContain(`@utility stroke-${stroke} {`);
    }
  });

  it("collapses every duration to the instant step under reduced motion", () => {
    // §10: colour and opacity transitions survive but drop to the instant step.
    const reducedMotion = declaredProperties(blockBody(REDUCED_MOTION_SELECTOR));
    for (const step of ["fast", "normal", "slow"]) {
      expect(reducedMotion.get(`--pp-duration-${step}`)).toBe("var(--pp-duration-instant)");
    }
  });
});
