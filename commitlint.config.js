/**
 * Conventional Commits, enforced by the `commit-msg` hook.
 *
 * The type list is the conventional default; `docs/` and `.claude/rules/` already
 * use feat, fix, docs, test, chore and ci, so no additions are needed yet.
 */
export default {
  extends: ["@commitlint/config-conventional"],
};
