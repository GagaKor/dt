#!/usr/bin/env bash
# Deploy entry point for a CI deploy key. Install it as a forced command in
# ~/.ssh/authorized_keys so the key can do nothing else (see docs/deploy.md):
#   restrict,command="/home/<user>/dt/scripts/deploy/remote-deploy.sh" ssh-ed25519 AAAA... dt-deploy
#
# The client's command must be `deploy <latest|sha-xxxxxxx>`.
# Optional stdin: registry user on line 1, registry token on line 2 (for private images).
#
# Steps: sync the checkout to origin/main, pull the image, restart the app and wait
# for its health check. If the new image is not healthy, the previous one is restored
# and the script exits non-zero.
set -euo pipefail

usage() {
  echo "usage: deploy <latest|sha-xxxxxxx>" >&2
  exit 2
}

set_image() {
  local value=$1
  if [[ -z $value ]]; then
    sed -i '/^DT_IMAGE=/d' .env
  elif grep -q '^DT_IMAGE=' .env; then
    sed -i "s|^DT_IMAGE=.*|DT_IMAGE=${value}|" .env
  else
    printf 'DT_IMAGE=%s\n' "$value" >>.env
  fi
}

rollback() {
  local prev=$1
  echo "new image is not healthy; recent app logs:" >&2
  docker compose logs --tail 50 app >&2 || true
  echo "rolling back to ${prev:-the locally built image}" >&2
  set_image "$prev"
  docker compose up -d --no-build --wait --wait-timeout 120 app >&2 || true
  exit 1
}

main() {
  local action='' tag='' extra=''
  read -r action tag extra <<<"${SSH_ORIGINAL_COMMAND:-$*}" || true
  [[ $action == deploy && -z $extra && $tag =~ ^(latest|sha-[0-9a-f]{7,40})$ ]] || usage

  local dir=${DT_DIR:-$HOME/dt}
  local repo=${DT_IMAGE_REPO:-ghcr.io/gagakor/dt}
  local image="${repo}:${tag}"
  cd "$dir"
  [[ -f .env ]] || { echo "missing $dir/.env" >&2; exit 1; }

  exec 9>"$dir/.deploy.lock"
  flock -n 9 || { echo "another deploy is running" >&2; exit 1; }

  # Registry credentials live only in a throwaway config for this run.
  local cfg
  cfg=$(mktemp -d)
  trap 'rm -rf "$cfg"' EXIT
  export DOCKER_CONFIG=$cfg
  local user='' token=''
  if IFS= read -r -t 5 user && IFS= read -r -t 5 token && [[ -n $token ]]; then
    printf '%s' "$token" | docker login "${repo%%/*}" -u "$user" --password-stdin >/dev/null
  fi

  git fetch --quiet origin main
  git checkout --quiet -B main origin/main

  local prev
  prev=$(sed -n 's/^DT_IMAGE=//p' .env | tail -n 1)
  set_image "$image"
  if ! docker compose pull --quiet app; then
    set_image "$prev"
    echo "could not pull $image" >&2
    exit 1
  fi
  docker compose up -d --no-build --wait --wait-timeout 120 app || rollback "$prev"

  docker image prune -f >/dev/null || true
  echo "deployed $image"
}

# Keep `exit` on the same line: the checkout above may rewrite this file while it runs.
main "$@"; exit $?
