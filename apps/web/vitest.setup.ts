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
