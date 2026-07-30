import type { Page } from "@playwright/test";
import { WEB_ORIGIN } from "./servers";

/**
 * Series and characters created through the api, for gates that need something on the
 * page without testing how it got there.
 *
 * The journeys in `series.spec.ts` and `characters.spec.ts` deliberately go through the
 * forms instead. These helpers exist so the accessibility gate can audit a page that only
 * exists once a series does, without re-driving the flow that creates one.
 *
 * The page must already carry a session (`signUpThroughApi`), because `page.request`
 * shares the browser context's cookie jar.
 */

async function currentWorkspaceId(page: Page): Promise<string> {
  const response = await page.request.get("/api/v1/workspaces/current");

  if (!response.ok()) {
    throw new Error(`could not read the current workspace: ${response.status()}`);
  }

  return ((await response.json()) as { id: string }).id;
}

export async function createSeriesThroughApi(page: Page, name: string): Promise<string> {
  const workspaceId = await currentWorkspaceId(page);
  const response = await page.request.post(`/api/v1/workspaces/${workspaceId}/series`, {
    headers: { origin: WEB_ORIGIN },
    data: { name },
  });

  if (!response.ok()) {
    throw new Error(`could not create a series: ${response.status()}`);
  }

  return ((await response.json()) as { id: string }).id;
}
