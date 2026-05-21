#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_BIN_DIR="$(mktemp -d)"
TMP_FIXTURE="$(mktemp -d)"
BIN="$TMP_BIN_DIR/orgm-dot"

fail() {
	echo "FAIL: $*" >&2
	exit 1
}

trap 'rm -rf "$TMP_BIN_DIR" "$TMP_FIXTURE"' EXIT

go build -o "$BIN" "$REPO_DIR/cmd/orgm-dot"

version="$($BIN version)"
[ "$version" = "orgm-dot dev" ] || fail "unexpected version output: $version"

fixture_repo="$TMP_FIXTURE/repo"
fixture_home="$TMP_FIXTURE/home"
mkdir -p "$fixture_repo/config" "$fixture_home"
cat >"$fixture_repo/config/dotfiles.json" <<JSON
{
  "settings": {
    "repo": "$fixture_repo",
    "destination": "~",
    "source_shared": "config/shared",
    "source_hosts": "config/hosts",
    "state_dir": "~/.local/state/dot.sh",
    "poll_seconds": 5
  },
  "shared": { "paths": [".config/fish", ".tmux.conf"] },
  "hosts": { "lenovo": { "paths": [".config/fish/age-host.fish"] } },
  "local_only": { "paths": [] },
  "diff": { "scan_roots": [] }
}
JSON

status="$(HOME="$fixture_home" DOT_SH_CONFIG="$fixture_repo/config/dotfiles.json" "$BIN" status --host lenovo)"

case "$status" in *"repo:        $fixture_repo"*) ;; *)
	echo "$status" >&2
	fail "status missing repo"
	;;
esac
case "$status" in *"config:      $fixture_repo/config/dotfiles.json"*) ;; *)
	echo "$status" >&2
	fail "status missing config"
	;;
esac
case "$status" in *"destination: $fixture_home"*) ;; *)
	echo "$status" >&2
	fail "status missing destination"
	;;
esac
case "$status" in *"shared src:  $fixture_repo/config/shared"*) ;; *)
	echo "$status" >&2
	fail "status missing shared source"
	;;
esac
case "$status" in *"host src:    $fixture_repo/config/hosts/lenovo"*) ;; *)
	echo "$status" >&2
	fail "status missing host source"
	;;
esac
case "$status" in *"state dir:   $fixture_home/.local/state/dot.sh"*) ;; *)
	echo "$status" >&2
	fail "status missing state dir"
	;;
esac
case "$status" in *"host:        lenovo"*) ;; *)
	echo "$status" >&2
	fail "status missing host"
	;;
esac
case "$status" in *"managed shared: 2"*) ;; *)
	echo "$status" >&2
	fail "status missing shared count"
	;;
esac
case "$status" in *"managed host:   1"*) ;; *)
	echo "$status" >&2
	fail "status missing host count"
	;;
esac

if HOME="$fixture_home" DOT_SH_CONFIG="$fixture_repo/config/dotfiles.json" "$BIN" status >/tmp/orgm-dot-missing-host.out 2>/tmp/orgm-dot-missing-host.err; then
	fail "status without --host should fail"
fi
grep -q -- "--host is required" /tmp/orgm-dot-missing-host.err || fail "missing host error not reported"

echo "orgm-dot smoke tests passed"
