import type { EpisodeDraftInput } from "@plotpop/contracts";
import type { z } from "zod";
import { messages } from "@/locales/en";

/**
 * Turns the script step's Zod issues into the copy the form shows.
 *
 * The schema in `packages/contracts` carries no messages on purpose: §14 keeps
 * visible strings in the localisation resource, so the mapping from a failure to
 * a sentence belongs here rather than in a cross service contract.
 *
 * Keyed by field and issue code, which is what lets one field distinguish "you
 * left it empty" from "that is too long" without the schema hard coding either
 * sentence.
 */
export type ScriptStepErrors = Partial<Record<keyof EpisodeDraftInput, string>>;

const COPY = messages.wizard.script;

/** Field order, so the summary reads in the order the form is filled in. */
const FIELD_ORDER: (keyof EpisodeDraftInput)[] = ["title", "script"];

function messageFor(field: keyof EpisodeDraftInput, code: string): string | undefined {
  if (field === "title") {
    if (code === "too_small") return COPY.title.errors.required;
    if (code === "too_big") return COPY.title.errors.tooLong;
    return undefined;
  }

  if (code === "too_small") return COPY.body.errors.tooShort;
  if (code === "too_big") return COPY.body.errors.tooLong;
  return undefined;
}

export function scriptStepErrors(issues: readonly z.core.$ZodIssue[]): ScriptStepErrors {
  const errors: ScriptStepErrors = {};

  for (const field of FIELD_ORDER) {
    const issue = issues.find((candidate) => candidate.path[0] === field);
    if (issue === undefined) continue;

    const message = messageFor(field, issue.code);
    // An issue with no mapped message means the form sent something the schema
    // did not expect, which is a defect rather than something to explain to the
    // user. It stays out of the summary and shows up as a failing test.
    if (message !== undefined) errors[field] = message;
  }

  return errors;
}
