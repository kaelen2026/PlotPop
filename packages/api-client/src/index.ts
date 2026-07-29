import type { AppType } from "@plotpop/api";
import { hc } from "hono/client";

/**
 * The client type is computed once, here, and exported as a concrete type.
 *
 * `hc<AppType>` walks the entire server route tree, which grows with every route
 * the api adds. Consumers importing `ApiClient` get the finished type instead of
 * repeating that computation in every file that calls the api
 * (docs/implementation-plan.md §8.1).
 */
const inferred = hc<AppType>("");

export type ApiClient = typeof inferred;

export type ApiClientOptions = Omit<Parameters<typeof hc<AppType>>[1], never>;

/**
 * `baseUrl` is the api origin. Production serves web and api from one origin
 * (ADR-007), so this is usually a path prefix rather than a cross-origin url.
 */
export function createApiClient(baseUrl: string, options?: ApiClientOptions): ApiClient {
  // A trailing slash would otherwise produce `//health`, which some proxies
  // redirect and others reject.
  return hc<AppType>(baseUrl.replace(/\/+$/, ""), options) as ApiClient;
}
