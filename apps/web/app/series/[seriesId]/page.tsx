import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SeriesDetail } from "@/components/series-detail";
import { serverApi, statusOf } from "@/lib/api-server";
import { routes } from "@/lib/routes";

/**
 * One series and its cast (`docs/ai-comic-drama-saas-design.md` §5.2, §20.2).
 *
 * Read on the server through `/api/v1` (ADR-001), so the cast is in the first paint and
 * the page holds no database credentials of its own.
 *
 * A series the caller cannot reach is a 404 here as it is at the api: the page must not
 * tell someone that an id they guessed belongs to a real series.
 */
export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  const { seriesId } = await params;
  const api = await serverApi();
  const workspace = await api.api.v1.workspaces.current.$get();
  const workspaceStatus = statusOf(workspace);

  // Not broken, just not signed in.
  if (workspaceStatus === 401) redirect(routes.signIn);

  if (workspaceStatus !== 200) {
    throw new Error(`could not read the current workspace: ${workspaceStatus}`);
  }

  const { id: workspaceId } = await workspace.json();
  const entry = api.api.v1.workspaces[":workspaceId"].series[":seriesId"];
  const [series, characters] = await Promise.all([
    entry.$get({ param: { workspaceId, seriesId } }),
    entry.characters.$get({ param: { workspaceId, seriesId } }),
  ]);

  if (series.status === 404 || characters.status === 404) notFound();

  if (series.status !== 200 || characters.status !== 200) {
    throw new Error(
      `could not read the series and its cast: ${series.status}, ${characters.status}`,
    );
  }

  return (
    <AppShell>
      <SeriesDetail
        characters={(await characters.json()).characters}
        series={await series.json()}
        workspaceId={workspaceId}
      />
    </AppShell>
  );
}
