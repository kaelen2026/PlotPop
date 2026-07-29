#!/usr/bin/env bash
#
# Runs the visual regression projects inside the pinned Playwright container.
#
# A screenshot only means something against a baseline drawn by the same
# renderer: font hinting, subpixel antialiasing and even Chromium's patch level
# move pixels. Rather than keep one baseline set per developer platform and let
# them drift apart, this repository keeps exactly one, produced by this container.
# CI runs this same script, so the comparison in a pull request is byte for byte
# the comparison you can reproduce locally.
#
#   e2e/visual.sh                       compare against the committed baselines
#   e2e/visual.sh --update-snapshots    redraw them, then review every PNG by eye
#
# Any further arguments are passed to `playwright test`.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "Visual regression needs Docker: the baselines belong to the pinned Playwright image." >&2
  exit 1
fi

if [ ! -d "${repo_root}/node_modules/@playwright/test" ]; then
  echo "Run pnpm install first: the image tag is derived from the installed Playwright version." >&2
  exit 1
fi

# Derived, never written down twice. A Playwright release ships its own browser
# build, so an image tag that disagreed with the dependency would compare against
# a different renderer than the one the tag promises.
version="$(node -p "require('${repo_root}/node_modules/@playwright/test/package.json').version")"
image="mcr.microsoft.com/playwright:v${version}-noble"

# The repository is bind mounted so new baselines land in the working tree, but
# every install target is a named volume: node_modules holds platform specific
# binaries, and the container's Linux copies must not overwrite the host's.
mounts=(--volume "${repo_root}:/repo")

add_volume() {
  local slug="${1//\//-}"
  mounts+=(--volume "plotpop-visual-${slug}:$2")
}

add_volume "root-node-modules" /repo/node_modules
while IFS= read -r manifest; do
  workspace="$(dirname "${manifest#"${repo_root}/"}")"
  add_volume "${workspace}-node-modules" "/repo/${workspace}/node_modules"
done < <(find "${repo_root}/apps" "${repo_root}/packages" -mindepth 2 -maxdepth 2 -name package.json | sort)

# Build output and caches, for the same reason, kept warm between runs. pnpm keeps
# its store on the same filesystem as node_modules, so it has to be a volume too
# or it lands in the working tree.
add_volume "web-next" /repo/apps/web/.next
add_volume "turbo" /repo/.turbo
add_volume "pnpm-store" /repo/.pnpm-store

# `--ignore-scripts` keeps the install from running the repository's `prepare`
# hook, which would rewrite the host's git hooks through the bind mount.
docker run --rm \
  --ipc=host \
  "${mounts[@]}" \
  --workdir /repo \
  --env CI \
  "${image}" \
  bash -c '
    set -euo pipefail
    corepack enable pnpm
    pnpm install --frozen-lockfile --ignore-scripts
    pnpm exec playwright test --project=visual-desktop --project=visual-small "$@"
  ' bash "$@"
