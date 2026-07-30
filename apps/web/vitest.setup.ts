import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Testing Library only registers its own cleanup when Vitest runs with globals,
 * which this project does not. Without it each render stacks on the last and
 * queries start finding two of everything. A no-op in the Node environment, where
 * nothing was rendered.
 */
afterEach(cleanup);

/**
 * jsdom implements no layout, so it has no `ResizeObserver`. Radix measures its own
 * elements with one — the checkbox does, through `useSize` — and without this a
 * component test crashes on mount rather than failing an assertion.
 *
 * A stub rather than a polyfill: nothing here asserts on a measurement, and one that
 * reported sizes would be reporting jsdom's zeroes.
 */
/**
 * jsdom has no blob url registry either, and a form that previews a chosen file before
 * uploading it needs one. Returning a recognisable placeholder rather than throwing keeps
 * the assertion on what the component did with the url, not on jsdom's gaps.
 */
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => {};
}

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}
