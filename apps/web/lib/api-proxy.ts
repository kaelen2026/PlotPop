import type { Rewrite } from "next/dist/lib/load-custom-routes";

/**
 * ADR-007: the browser talks to one origin and Next forwards `/api/*` to the api.
 *
 * That is what makes the session cookie first-party. A browser calling the api's
 * own origin would be handing over a third-party cookie, and Safari's tracking
 * prevention drops those — which shows up as randomly expiring logins in the first
 * market PlotPop ships to, not as an error anyone can debug.
 *
 * Both `/api/v1/*` and `/api/auth/*` go through here: the api owns everything
 * under `/api`, and the web tier has no routes of its own there.
 */
export function apiProxyRewrites(apiBaseUrl: string): Rewrite[] {
  // A trailing slash would produce `//api/...`, which some proxies redirect and
  // others reject.
  const origin = apiBaseUrl.replace(/\/+$/, "");

  return [{ source: "/api/:path*", destination: `${origin}/api/:path*` }];
}
