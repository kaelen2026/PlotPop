/**
 * The application's routes in one place, so a link and the test that checks it
 * cannot drift apart through a typo.
 */
export const routes = {
  landing: "/",
  signIn: "/sign-in",
  signUp: "/sign-up",
  creatorHome: "/home",
  series: "/series",
  newEpisode: "/episodes/new",
} as const;

/** One series and its cast. A function because the id is part of the path. */
export function seriesDetailRoute(seriesId: string): string {
  return `/series/${seriesId}`;
}

/** An episode's Studio. A function because the id is part of the path. */
export function episodeStudioRoute(episodeId: string): string {
  return `/episodes/${episodeId}`;
}

/** The skip link target inside the application shell (§15). */
export const MAIN_CONTENT_ID = "main-content";
