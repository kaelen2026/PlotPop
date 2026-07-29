import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The conditional class helper required by `docs/design-system.md` §3.
 *
 * `twMerge` is what makes the approved `className` uses in §16 safe: a layout
 * class passed by a page cannot end up fighting a component's own utility, it
 * replaces it.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
