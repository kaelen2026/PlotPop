/**
 * The application's routes in one place, so a link and the test that checks it
 * cannot drift apart through a typo.
 */
export const routes = {
  landing: "/",
  creatorHome: "/home",
  newEpisode: "/episodes/new",
} as const;

/** The skip link target inside the application shell (§15). */
export const MAIN_CONTENT_ID = "main-content";
