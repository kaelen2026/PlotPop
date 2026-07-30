import { type ApiClient, createApiClient } from "@plotpop/api-client";
import { parseWebEnv } from "@plotpop/config";
import { cookies } from "next/headers";

/**
 * The api as a Server Component reaches it.
 *
 * Two things differ from the browser's client. The origin is explicit, because the
 * rewrite in `next.config.ts` exists only for the browser — a request made on the
 * server has no origin of its own to be forwarded from. And the session cookie has
 * to be carried across by hand: a server render is a separate request to the api,
 * and nothing attaches the visitor's cookies to it.
 *
 * A page reads data through this rather than through the database (ADR-001): the web
 * tier holds no database, queue or storage credentials at all.
 */
export async function serverApi(): Promise<ApiClient> {
  const cookie = (await cookies()).toString();

  return createApiClient(parseWebEnv().apiBaseUrl, {
    headers: cookie === "" ? undefined : { cookie },
  });
}

/**
 * The status a response actually carries.
 *
 * The api's `401` comes from the session middleware, and Hono does not fold a
 * middleware's response into the route's type — so the RPC client believes a
 * business route can only answer `200`, and comparing its status against `401` is a
 * type error rather than a check. Reading the status as a number is what lets a page
 * tell "not signed in" apart from a fault, without pretending the narrow type is
 * wrong about the success case.
 */
export function statusOf(response: { readonly status: number }): number {
  return response.status;
}
