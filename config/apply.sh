#!/usr/bin/env bash
set -u -o pipefail

CONFIG_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TARGET_HOME="${STOW_TARGET:-$HOME}"

if ! command -v stow >/dev/null 2>&1; then
  echo "[fatal] Missing dependency: stow" >&2
  exit 127
fi

cd "$CONFIG_DIR" || exit 1

failed=0
applied=0
skipped=0
CHEZMOI_PACKAGES=(dms pi)

is_chezmoi_package() {
  local package="$1"
  local chezmoi_package

  for chezmoi_package in "${CHEZMOI_PACKAGES[@]}"; do
    [[ "$package" == "$chezmoi_package" ]] && return 0
  done

  return 1
}

for package_path in */; do
  package=${package_path%/}

  if [[ ! -d "$package" ]]; then
    ((skipped++))
    continue
  fi

  if is_chezmoi_package "$package"; then
    echo "[skip] $package is managed by chezmoi"
    ((skipped++))
    continue
  fi

  echo "==> stow -R --no-folding -t $TARGET_HOME $package"

  if stow -R --no-folding -t "$TARGET_HOME" "$package"; then
    echo "[ok] $package"
    ((applied++))
  else
    status=$?
    echo "[error] $package failed with exit code $status" >&2
    ((failed++))
  fi

done

echo "==> summary: applied=$applied failed=$failed skipped=$skipped"

if (( failed > 0 )); then
  exit 1
fi
