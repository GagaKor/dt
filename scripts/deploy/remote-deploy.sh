#!/usr/bin/env bash
# Deploy entry point for a CI deploy key. Install it as a forced command in
# ~/.ssh/authorized_keys so the key can do nothing else (see docs/deploy.md):
#   restrict,command="/home/<user>/dt/scripts/deploy/remote-deploy.sh" ssh-ed25519 AAAA... dt-deploy
#
# The client's command must be `deploy sha-<commit>`; the commit must be on origin/main.
# Optional stdin: registry user on line 1, registry token on line 2 (for private images).
#
# Steps:
# 1. Check out exactly that commit.
# 2. Pull its image and back up the database.
# 3. Restart the app and wait for its health check.
# If the new image is not healthy, the previous checkout and image are restored, the
# app logs are saved on the server (never printed to CI), and the script exits non-zero.
set -euo pipefail

DT_DIR=${DT_DIR:-$HOME/dt}
DT_IMAGE_REPO=${DT_IMAGE_REPO:-ghcr.io/gagakor/dt}
DOCKER_TMP_CONFIG=''
PREV_HEAD=''
PREV_IMAGE=''

usage() {
  echo "usage: deploy sha-<commit>" >&2
  exit 2
}

fail() {
  echo "$*" >&2
  exit 1
}

# shellcheck disable=SC2329 # invoked through `trap cleanup EXIT`
cleanup() {
  if [[ -n $DOCKER_TMP_CONFIG ]]; then rm -rf "$DOCKER_TMP_CONFIG"; fi
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

restore_files() {
  git checkout --quiet -B main "$PREV_HEAD"
  set_image "$PREV_IMAGE"
}

backup_db() {
  mkdir -p backups
  local file
  file="backups/pre-deploy-$(date +%Y%m%dT%H%M%S).dump"
  if ! docker compose exec -T db pg_dump -U dt -Fc dt >"$file"; then
    rm -f "$file"
    restore_files
    fail "database backup failed; nothing was deployed"
  fi
  # Keep the five most recent backups.
  find backups -maxdepth 1 -name 'pre-deploy-*.dump' -printf '%T@ %p\n' | sort -rn | tail -n +6 | cut -d' ' -f2- | xargs -r rm -f
}

rollback() {
  local log
  log="$DT_DIR/deploy-logs/failed-$(date +%Y%m%dT%H%M%S).log"
  docker compose logs --tail 200 app >"$log" 2>&1 || true
  echo "the new image is not healthy; app logs are saved on the server in $log" >&2
  restore_files
  if docker image inspect dt:rollback >/dev/null 2>&1 &&
    DT_IMAGE=dt:rollback docker compose up -d --no-build --wait --wait-timeout 120 app >&2; then
    echo "rolled back to the previous image" >&2
  else
    echo "ROLLBACK FAILED: the app may be down; check the server" >&2
  fi
  exit 1
}

prune_images() {
  local keep=$1
  docker image ls "$DT_IMAGE_REPO" --format '{{.Repository}}:{{.Tag}}' |
    grep ':sha-' | grep -vxF -e "$keep" -e "${PREV_IMAGE:-none}" |
    xargs -r docker rmi >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
}

main() {
  local action='' tag='' extra=''
  read -r action tag extra <<<"${SSH_ORIGINAL_COMMAND:-$*}" || true
  [[ $action == deploy && -z $extra && $tag =~ ^sha-[0-9a-f]{7,40}$ ]] || usage
  local image="${DT_IMAGE_REPO}:${tag}" sha=${tag#sha-}

  cd "$DT_DIR"
  [[ -f .env ]] || fail "missing $DT_DIR/.env"
  mkdir -p deploy-logs
  # Keep going if the CI connection drops, and keep a server-side log of every run.
  trap '' HUP PIPE
  exec > >(tee -a --output-error=warn-nopipe deploy-logs/deploy.log) 2>&1
  echo "== $(date -Is) deploy $tag"

  exec 9>.deploy.lock
  flock -n 9 || fail "another deploy is running"

  # Registry credentials live only in a throwaway config for this run.
  DOCKER_TMP_CONFIG=$(mktemp -d)
  trap cleanup EXIT
  export DOCKER_CONFIG=$DOCKER_TMP_CONFIG
  local user='' token=''
  if IFS= read -r -t 5 user && IFS= read -r -t 5 token && [[ -n $token ]]; then
    printf '%s' "$token" | docker login "${DT_IMAGE_REPO%%/*}" -u "$user" --password-stdin >/dev/null
  fi

  git -c gc.auto=0 -c maintenance.auto=false fetch --quiet origin main 9>&-
  local commit
  commit=$(git rev-parse --verify --quiet "${sha}^{commit}") || fail "unknown commit $sha"
  git merge-base --is-ancestor "$commit" origin/main || fail "$sha is not on main"

  PREV_HEAD=$(git rev-parse HEAD)
  PREV_IMAGE=$(sed -n 's/^DT_IMAGE=//p' .env | tail -n 1)
  local running
  running=$(docker compose ps -q app 2>/dev/null | head -n 1)
  if [[ -n $running ]]; then
    docker tag "$(docker inspect --format '{{.Image}}' "$running")" dt:rollback
  fi

  git checkout --quiet -B main "$commit"
  set_image "$image"
  if ! docker compose pull --quiet app; then
    restore_files
    fail "could not pull $image; nothing was deployed"
  fi
  backup_db
  docker compose up -d --no-build --wait --wait-timeout 120 app || rollback

  prune_images "$image"
  echo "deployed $image"
}

# Keep `exit` on the same line: the checkout above rewrites this file while it runs.
main "$@"; exit $?
