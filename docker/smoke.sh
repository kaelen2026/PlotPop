#!/usr/bin/env bash
#
# Starts a built service image and asserts the properties an image has to hold
# before it is worth deploying. Run from the repository root:
#
#   docker/smoke.sh plotpop-api:ci api 3001
#
# Dependencies are pointed at a closed port on purpose: an image that reports
# itself ready without ever probing anything is the failure this catches.

set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <image> <service> <port>" >&2
  exit 64
fi

image="$1"
service="$2"
port="$3"
container="smoke-${service}-$$"
dead="127.0.0.1:1"

cleanup() {
  docker rm --force "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "FAIL: $1" >&2
  echo "--- container logs ---" >&2
  docker logs "$container" >&2 2>&1 || true
  exit 1
}

echo "==> image ships no build tooling"
if docker run --rm --entrypoint sh "$image" -c '[ -e node_modules/typescript ] || [ -e node_modules/vitest ]'; then
  fail "$image contains development dependencies"
fi

echo "==> image runs unprivileged"
uid="$(docker run --rm --entrypoint sh "$image" -c 'id -u')"
[ "$uid" != "0" ] || fail "$image runs as root"

echo "==> container starts"
docker run --detach --name "$container" --init \
  --publish "127.0.0.1:${port}:${port}" \
  --env "LOG_LEVEL=debug" \
  --env "DATABASE_URL=postgresql://plotpop:smoke@${dead}/plotpop" \
  --env "REDIS_URL=redis://${dead}" \
  --env "STORAGE_ENDPOINT=http://${dead}" \
  --env "STORAGE_BUCKET=smoke" \
  --env "STORAGE_ACCESS_KEY_ID=smoke" \
  --env "STORAGE_SECRET_ACCESS_KEY=smoke" \
  "$image" >/dev/null

echo "==> container reaches its own healthcheck"
for _ in $(seq 1 30); do
  state="$(docker inspect --format '{{.State.Health.Status}}' "$container")"
  [ "$state" = "starting" ] || break
  sleep 1
done
[ "$state" = "healthy" ] || fail "healthcheck reported '$state'"

echo "==> liveness identifies the service"
liveness="$(curl --silent --fail "http://127.0.0.1:${port}/health")"
case "$liveness" in
  *"\"service\":\"${service}\""*) ;;
  *) fail "unexpected liveness payload: $liveness" ;;
esac

echo "==> readiness refuses traffic while dependencies are unreachable"
status="$(curl --silent --output /tmp/ready.json --write-out '%{http_code}' "http://127.0.0.1:${port}/ready")"
readiness="$(cat /tmp/ready.json)"
[ "$status" = "503" ] || fail "readiness answered $status with $readiness"
case "$readiness" in
  *'"status":"degraded"'*'"status":"down"'*) ;;
  *) fail "readiness did not report a dependency as down: $readiness" ;;
esac

echo "==> logs are structured"
logs="$(docker logs "$container" 2>&1)"
case "$logs" in
  *'"message":"listening"'*) ;;
  *) fail "no structured startup log found" ;;
esac

echo "PASS: $image"
