#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="dot.sh"
SCRIPT_PATH="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1; then
  SCRIPT_PATH="$(readlink -f "$SCRIPT_PATH" 2>/dev/null || printf '%s' "$SCRIPT_PATH")"
fi
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
DEFAULT_REPO="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$SCRIPT_DIR")"
CONFIG_FILE="${DOT_SH_CONFIG:-$DEFAULT_REPO/config/dotfiles.json}"

CMD=""
HOST=""
SCOPE=""
TARGET=""
DRY_RUN=0
NO_COLOR=0
PORCELAIN=0
VERBOSE=0
INTERVAL=""

usage() {
  cat <<'EOF'
Usage:
  dot.sh diff --host HOST [--no-color|--porcelain]
  dot.sh sync --host HOST [--dry-run]
  dot.sh daemon --host HOST
  dot.sh add PATH (--shared|--host HOST)
  dot.sh remove PATH (--shared|--host HOST)
  dot.sh install
  dot.sh status --host HOST

Legacy command flags like --diff and --sync still work, but the fast form
without -- is preferred.

Environment:
  DOT_SH_CONFIG=/path/to/dotfiles.json
EOF
}

fail() { printf '%s: %s\n' "$SCRIPT_NAME" "$*" >&2; exit 1; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || fail "missing dependency: $1"; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    diff|sync|daemon|install|status)
      [ -z "$CMD" ] || fail "only one command is allowed"
      CMD="$1"
      shift
      ;;
    --diff|--sync|--daemon|--install|--status)
      [ -z "$CMD" ] || fail "only one command is allowed"
      CMD="${1#--}"
      shift
      ;;
    add|remove)
      [ -z "$CMD" ] || fail "only one command is allowed"
      CMD="$1"
      shift
      [ "$#" -gt 0 ] || fail "$CMD requires PATH"
      TARGET="$1"
      shift
      ;;
    --add|--remove)
      [ -z "$CMD" ] || fail "only one command is allowed"
      CMD="${1#--}"
      shift
      [ "$#" -gt 0 ] || fail "$CMD requires PATH"
      TARGET="$1"
      shift
      ;;
    --host)
      shift
      [ "$#" -gt 0 ] || fail "--host requires a value"
      HOST="$1"
      SCOPE="host"
      shift
      ;;
    --shared)
      SCOPE="shared"
      shift
      ;;
    --dry-run) DRY_RUN=1; shift ;;
    --no-color) NO_COLOR=1; shift ;;
    --porcelain) PORCELAIN=1; NO_COLOR=1; shift ;;
    --verbose|-v) VERBOSE=1; shift ;;
    --interval)
      shift
      [ "$#" -gt 0 ] || fail "--interval requires seconds"
      INTERVAL="$1"
      shift
      ;;
    --config)
      shift
      [ "$#" -gt 0 ] || fail "--config requires path"
      CONFIG_FILE="$1"
      shift
      ;;
    --help|-h) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[ -n "$CMD" ] || { usage; exit 1; }
need_cmd jq
[ -f "$CONFIG_FILE" ] || fail "config not found: $CONFIG_FILE"

json_get() { jq -r "$1 // empty" "$CONFIG_FILE"; }
expand_path() {
  case "$1" in
    "~") printf '%s\n' "$HOME" ;;
    "~/"*) printf '%s/%s\n' "$HOME" "${1#\~/}" ;;
    /*) printf '%s\n' "$1" ;;
    *) printf '%s/%s\n' "$REPO" "$1" ;;
  esac
}
strip_slashes() {
  local p="$1"
  p="${p#./}"
  p="${p#/}"
  p="${p%/}"
  printf '%s\n' "$p"
}

REPO="$(json_get '.settings.repo')"
[ -n "$REPO" ] || REPO="$DEFAULT_REPO"
REPO="$(expand_path "$REPO")"
DESTINATION="$(expand_path "$(json_get '.settings.destination')")"
[ -n "$DESTINATION" ] || DESTINATION="$HOME"
SOURCE_SHARED="$(expand_path "$(json_get '.settings.source_shared')")"
SOURCE_HOSTS="$(expand_path "$(json_get '.settings.source_hosts')")"
STATE_DIR="$(expand_path "$(json_get '.settings.state_dir')")"
POLL_SECONDS="$(json_get '.settings.poll_seconds')"
POLL_SECONDS="${INTERVAL:-${POLL_SECONDS:-5}}"

if [ "$NO_COLOR" -eq 0 ] && [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; BLUE=$'\033[34m'; GRAY=$'\033[90m'; RESET=$'\033[0m'
else
  RED=""; GREEN=""; BLUE=""; GRAY=""; RESET=""
fi

require_host() { [ -n "$HOST" ] || fail "--host is required"; }
require_scope() {
  case "$SCOPE" in
    shared) ;;
    host) [ -n "$HOST" ] || fail "--host is required for host scope" ;;
    *) fail "choose --shared or --host HOST" ;;
  esac
}

is_local_only() {
  local rel="$(strip_slashes "$1")"
  jq -e --arg p "$rel" '
    .local_only.paths // []
    | any(. as $m | $p == $m or ($p | startswith($m + "/")))
  ' "$CONFIG_FILE" >/dev/null
}

is_managed_path() {
  local rel="$(strip_slashes "$1")"
  jq -e --arg host "$HOST" --arg p "$rel" '
    ((.shared.paths // []) + (.hosts[$host].paths // []))
    | any(. as $m | $p == $m or ($p | startswith($m + "/")))
  ' "$CONFIG_FILE" >/dev/null
}

print_item() {
  local code="$1" path="$2" color=""
  case "$code" in
    M) color="$BLUE" ;;
    A) color="$GREEN" ;;
    D|R) color="$RED" ;;
    L) color="$GRAY" ;;
  esac
  if [ "$PORCELAIN" -eq 1 ]; then
    printf '%s\t%s\n' "$code" "$path"
  else
    printf '%b%s%b  %s\n' "$color" "$code" "$RESET" "$path"
  fi
}

config_paths() {
  local scope="$1"
  if [ "$scope" = shared ]; then
    jq -r '.shared.paths[]?' "$CONFIG_FILE"
  else
    jq -r --arg host "$HOST" '.hosts[$host].paths[]?' "$CONFIG_FILE"
  fi
}

scan_roots() { jq -r '.diff.scan_roots[]?' "$CONFIG_FILE"; }

source_base_for_scope() {
  if [ "$1" = shared ]; then
    printf '%s\n' "$SOURCE_SHARED"
  else
    printf '%s/%s\n' "$SOURCE_HOSTS" "$HOST"
  fi
}

compare_file() {
  local src="$1" dst="$2" rel="$3"
  is_local_only "$rel" && { [ "$VERBOSE" -eq 1 ] && print_item L "$DESTINATION/$rel"; return; }
  if [ ! -e "$dst" ]; then
    print_item A "$DESTINATION/$rel"
  elif [ -f "$src" ] && [ -f "$dst" ]; then
    cmp -s "$src" "$dst" || print_item M "$DESTINATION/$rel"
  fi
}

diff_source_path() {
  local base="$1" root_rel src dst
  root_rel="$(strip_slashes "$2")"
  src="$base/$root_rel"
  dst="$DESTINATION/$root_rel"
  [ -e "$src" ] || return 0
  if [ -f "$src" ]; then
    compare_file "$src" "$dst" "$root_rel"
    return 0
  fi
  [ -d "$src" ] || return 0
  while IFS= read -r -d '' f; do
    local rel_part rel
    rel_part="${f#$src/}"
    rel="$root_rel/$rel_part"
    compare_file "$f" "$DESTINATION/$rel" "$rel"
  done < <(find "$src" -type f -print0)

  [ -d "$dst" ] || return 0
  while IFS= read -r -d '' f; do
    local rel_part rel
    rel_part="${f#$dst/}"
    rel="$root_rel/$rel_part"
    is_local_only "$rel" && { [ "$VERBOSE" -eq 1 ] && print_item L "$DESTINATION/$rel"; continue; }
    [ -e "$src/$rel_part" ] || print_item R "$DESTINATION/$rel"
  done < <(find "$dst" -type f -print0)
}

run_diff() {
  require_host
  if [ "$PORCELAIN" -eq 0 ]; then
    printf 'dot.sh diff --host %s\n' "$HOST"
  fi
  local p
  while IFS= read -r p; do diff_source_path "$SOURCE_SHARED" "$p"; done < <(config_paths shared)
  while IFS= read -r p; do diff_source_path "$SOURCE_HOSTS/$HOST" "$p"; done < <(config_paths host)
}

rsync_one() {
  local base="$1" rel src dst
  rel="$(strip_slashes "$2")"
  src="$base/$rel"
  dst="$DESTINATION/$rel"
  [ -e "$src" ] || return 0
  local args=(-a --delete)
  while IFS= read -r lo; do
    lo="$(strip_slashes "$lo")"
    case "$lo" in
      "$rel"/*) args+=(--exclude "${lo#$rel/}") ;;
      "$rel") args+=(--exclude "$(basename "$lo")") ;;
    esac
  done < <(jq -r '.local_only.paths[]?' "$CONFIG_FILE")
  [ "$DRY_RUN" -eq 1 ] && args+=(--dry-run --itemize-changes)
  if [ -d "$src" ]; then
    mkdir -p "$dst"
    rsync "${args[@]}" "$src/" "$dst/"
  else
    mkdir -p "$(dirname "$dst")"
    rsync "${args[@]}" "$src" "$dst"
  fi
}

run_sync() {
  require_host
  need_cmd rsync
  local p lock="$STATE_DIR/sync.lock"
  mkdir -p "$STATE_DIR"
  exec 9>"$lock"
  flock -n 9 || fail "sync already running"
  while IFS= read -r p; do rsync_one "$SOURCE_SHARED" "$p"; done < <(config_paths shared)
  while IFS= read -r p; do rsync_one "$SOURCE_HOSTS/$HOST" "$p"; done < <(config_paths host)
}

normalize_target_rel() {
  local p="$1"
  case "$p" in
    "~/"*) p="$HOME/${p#\~/}" ;;
  esac
  if [[ "$p" = "$DESTINATION"/* ]]; then
    strip_slashes "${p#$DESTINATION/}"
  elif [[ "$p" = /* ]]; then
    fail "target must be inside destination: $DESTINATION"
  else
    strip_slashes "$p"
  fi
}

json_update_add_path() {
  local rel="$1" scope="$2" tmp
  tmp="$(mktemp)"
  if [ "$scope" = shared ]; then
    jq --arg p "$rel" '
      .local_only.paths = ((.local_only.paths // []) - [$p]) |
      .shared.paths = (((.shared.paths // []) + [$p]) | unique)
    ' "$CONFIG_FILE" > "$tmp"
  else
    jq --arg host "$HOST" --arg p "$rel" '
      .local_only.paths = ((.local_only.paths // []) - [$p]) |
      .hosts[$host].paths = (((.hosts[$host].paths // []) + [$p]) | unique)
    ' "$CONFIG_FILE" > "$tmp"
  fi
  mv "$tmp" "$CONFIG_FILE"
}

json_update_remove_path() {
  local rel="$1" scope="$2" tmp
  tmp="$(mktemp)"
  if [ "$scope" = shared ]; then
    jq --arg p "$rel" '
      .shared.paths = ((.shared.paths // []) - [$p]) |
      .local_only.paths = (((.local_only.paths // []) + [$p]) | unique)
    ' "$CONFIG_FILE" > "$tmp"
  else
    jq --arg host "$HOST" --arg p "$rel" '
      .hosts[$host].paths = ((.hosts[$host].paths // []) - [$p]) |
      .local_only.paths = (((.local_only.paths // []) + [$p]) | unique)
    ' "$CONFIG_FILE" > "$tmp"
  fi
  mv "$tmp" "$CONFIG_FILE"
}

run_add() {
  require_scope
  need_cmd rsync
  local rel src_base target_src local_path
  rel="$(normalize_target_rel "$TARGET")"
  local_path="$DESTINATION/$rel"
  [ -e "$local_path" ] || fail "local path does not exist: $local_path"
  src_base="$(source_base_for_scope "$SCOPE")"
  target_src="$src_base/$rel"
  mkdir -p "$(dirname "$target_src")"
  if [ -d "$local_path" ]; then
    local args=(-a --delete --delete-excluded)
    while IFS= read -r lo; do
      lo="$(strip_slashes "$lo")"
      case "$lo" in
        "$rel"/*) args+=(--exclude "${lo#$rel/}") ;;
      esac
    done < <(jq -r '.local_only.paths[]?' "$CONFIG_FILE")
    mkdir -p "$target_src"
    rsync "${args[@]}" "$local_path/" "$target_src/"
  else
    rsync -a "$local_path" "$target_src"
  fi
  json_update_add_path "$rel" "$SCOPE"
  print_item A "$rel -> $target_src"
}

run_remove() {
  require_scope
  local rel src_base target_src
  rel="$(normalize_target_rel "$TARGET")"
  src_base="$(source_base_for_scope "$SCOPE")"
  target_src="$src_base/$rel"
  rm -rf -- "$target_src"
  json_update_remove_path "$rel" "$SCOPE"
  print_item R "$rel removed from source; local preserved"
}

current_head() { git -C "$REPO" rev-parse HEAD 2>/dev/null || true; }

run_daemon() {
  require_host
  need_cmd git
  need_cmd rsync
  mkdir -p "$STATE_DIR"
  local state_file="$STATE_DIR/last-head-$HOST" last="" head=""
  [ -f "$state_file" ] && last="$(cat "$state_file")"
  printf 'dot.sh daemon --host %s watching %s every %ss\n' "$HOST" "$REPO" "$POLL_SECONDS"
  while true; do
    head="$(current_head)"
    if [ -n "$head" ] && [ "$head" != "$last" ]; then
      printf '%s -> %s: syncing\n' "${last:-none}" "$head"
      run_sync
      printf '%s\n' "$head" > "$state_file"
      last="$head"
    fi
    sleep "$POLL_SECONDS"
  done
}

run_install() {
  mkdir -p "$HOME/.local/bin"
  ln -sfn "$SCRIPT_PATH" "$HOME/.local/bin/dot"
  ln -sfn "$SCRIPT_PATH" "$HOME/.local/bin/dot.sh"
  printf 'installed: %s -> %s\n' "$HOME/.local/bin/dot" "$SCRIPT_PATH"
  printf 'installed: %s -> %s\n' "$HOME/.local/bin/dot.sh" "$SCRIPT_PATH"
  printf 'launch example: dot daemon --host orgm\n'
}

run_status() {
  require_host
  printf 'repo:        %s\n' "$REPO"
  printf 'config:      %s\n' "$CONFIG_FILE"
  printf 'destination: %s\n' "$DESTINATION"
  printf 'shared src:  %s\n' "$SOURCE_SHARED"
  printf 'host src:    %s/%s\n' "$SOURCE_HOSTS" "$HOST"
  printf 'head:        %s\n' "$(current_head)"
  printf 'state dir:   %s\n' "$STATE_DIR"
}

case "$CMD" in
  diff) run_diff ;;
  sync) run_sync ;;
  daemon) run_daemon ;;
  add) run_add ;;
  remove) run_remove ;;
  install) run_install ;;
  status) run_status ;;
  *) fail "unknown command: $CMD" ;;
esac
