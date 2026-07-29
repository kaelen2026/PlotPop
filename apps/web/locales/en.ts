/**
 * English UI copy. `docs/design-system.md` §14 keeps every visible string out of
 * components, so base components take copy as props and pages read it from here.
 *
 * The first UI is English only; this stays a plain module until a second locale
 * makes a loader worth its weight.
 *
 * ## Adding copy
 *
 * One module per page or per shared surface, named in kebab-case after what it
 * covers, exporting a single `as const` object under its camelCase name. Add copy
 * to the module that owns the surface — this file only aggregates, so slices that
 * land on separate branches each touch one file of their own plus one line below.
 * `locales/en.test.ts` fails if a module is missing from the aggregate, so a
 * forgotten line cannot reach the browser as absent copy.
 */
import { creatorHome } from "./creator-home";
import { generationStatus } from "./generation-status";
import { landing } from "./landing";
import { shell } from "./shell";
import { studio } from "./studio";
import { theme } from "./theme";
import { wizard } from "./wizard";

export const messages = {
  creatorHome,
  generationStatus,
  landing,
  shell,
  studio,
  theme,
  wizard,
} as const;

export type Messages = typeof messages;
