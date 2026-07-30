import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SeriesLibrary } from "@/components/series-library";
import { serverApi, statusOf } from "@/lib/api-server";
import { routes } from "@/lib/routes";
import { messages } from "@/locales/en";

export const metadata: Metadata = {
  title: `${messages.series.title} · PlotPop`,
};

/**
 * The series library (`docs/ai-comic-drama-saas-design.md` §5.2).
 *
 * The first page that reads real data. It goes through `/api/v1` rather than the
 * database (ADR-001), and it reads on the server so the list is in the first paint
 * rather than arriving after a spinner.
 *
 * Two requests, not one: the workspace comes first because MVP does not put its id
 * in the url (§20.1 gives each user exactly one), and the library hangs off the
 * workspace that owns it.
 */
export default async function SeriesPage() {
  const api = await serverApi();
  const workspace = await api.api.v1.workspaces.current.$get();

  /*
   * No session, so there is nothing to render. Sent to sign in rather than shown an
   * error: the page is not broken, the visitor is simply not signed in yet.
   */
  const workspaceStatus = statusOf(workspace);

  if (workspaceStatus === 401) redirect(routes.signIn);

  if (workspaceStatus !== 200) {
    throw new Error(`could not read the current workspace: ${workspaceStatus}`);
  }

  const { id: workspaceId } = await workspace.json();
  const listed = await api.api.v1.workspaces[":workspaceId"].series.$get({
    param: { workspaceId },
  });

  /*
   * Narrowed on the response's own status, not through `statusOf`: this route
   * declares its `404`, so the check is what makes the success payload readable. The
   * workspace answered a moment ago, so anything but `200` here is a fault rather
   * than a state to design for, and it surfaces as the error boundary.
   */
  if (listed.status !== 200) {
    throw new Error(`could not read the workspace's series: ${listed.status}`);
  }

  const { series } = await listed.json();

  return (
    <AppShell>
      <SeriesLibrary series={series} workspaceId={workspaceId} />
    </AppShell>
  );
}
