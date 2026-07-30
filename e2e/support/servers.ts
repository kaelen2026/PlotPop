/**
 * Where the gates' servers listen.
 *
 * Read by `playwright.config.ts`, which starts them, and by the specs, which need
 * the web origin as an absolute string for the one header Playwright does not fill
 * in for them. Stating it once is what keeps a spec from asserting against a port
 * the config does not use.
 *
 * Dedicated ports, not 3000 and 3001: `pnpm test:e2e` has to be safe to run while
 * `pnpm dev` and the compose stack are up, and a run must never quietly attach to
 * a development server whose build is not the one under test.
 */
export const WEB_PORT = 3100;
export const API_PORT = 3101;

export const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
export const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
