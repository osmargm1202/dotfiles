#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRIPT="$REPO_DIR/scripts/windows-rdp.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

make_stub() {
  local dir="$1" name="$2" body="$3"
  cat >"$dir/$name" <<EOF
#!/usr/bin/bash
$body
EOF
  chmod +x "$dir/$name"
}

run_case() {
  local name="$1" setup="$2" expected="$3"
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  make_stub "$tmp" nc 'exit 0'
  make_stub "$tmp" docker 'exit 0'
  make_stub "$tmp" podman 'exit 127'

  eval "$setup"

  PATH="$tmp" /usr/bin/bash "$SCRIPT" connect >/"$tmp/out" 2>/"$tmp/err" || true

  grep -q "$expected" "$tmp/calls" || {
    echo "--- calls ---" >&2
    cat "$tmp/calls" >&2 2>/dev/null || true
    echo "--- stdout ---" >&2
    cat "$tmp/out" >&2
    echo "--- stderr ---" >&2
    cat "$tmp/err" >&2
    fail "$name expected call matching: $expected"
  }
}

run_case \
  "uses prime-run with host xfreerdp3 when NVIDIA offload is available" \
  'make_stub "$tmp" xfreerdp3 "echo xfreerdp3 \"\$@\" >>\"$tmp/calls\""; make_stub "$tmp" prime-run "echo prime-run \"\$@\" >>\"$tmp/calls\"; exec \"\$@\""; make_stub "$tmp" distrobox-enter "echo distrobox-enter \"\$@\" >>\"$tmp/calls\""' \
  "prime-run xfreerdp3"

run_case \
  "uses host xfreerdp when NixOS FreeRDP provides the unversioned binary" \
  'make_stub "$tmp" xfreerdp "echo xfreerdp \"\$@\" >>\"$tmp/calls\""; make_stub "$tmp" distrobox-enter "echo distrobox-enter \"\$@\" >>\"$tmp/calls\""' \
  "xfreerdp /v:localhost:3389"

run_case \
  "falls back to distrobox when host FreeRDP is missing" \
  'make_stub "$tmp" distrobox-enter "echo distrobox-enter \"\$@\" >>\"$tmp/calls\""' \
  "distrobox-enter arch -- xfreerdp3"

echo "windows-rdp tests passed"
