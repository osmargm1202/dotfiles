#!/usr/bin/env bash
set -euo pipefail

repo="$HOME/Hobby/dotfiles"
host="$(hostname)"
source_dir="$(chezmoi source-path)"
msg="${1:-sync $host config}"

if [[ ! -d "$repo/.git" ]]; then
  echo "chezpush: repo not found: $repo" >&2
  exit 1
fi

if [[ "$source_dir" != "$repo/chezmoi" ]]; then
  echo "chezpush: chezmoi source is $source_dir, expected $repo/chezmoi" >&2
  exit 1
fi

copy_file() {
  local src="$1" dst="$2"
  [[ -f "$src" ]] || return 0
  mkdir -p "$(dirname "$dst")"
  rsync -a "$src" "$dst"
}

copy_dir() {
  local src="$1" dst="$2"
  shift 2
  [[ -d "$src" ]] || return 0
  mkdir -p "$dst"
  rsync -a --delete "$@" "$src/" "$dst/"
}

# Shared Pi config.
copy_file "$HOME/.pi/agent/AGENTS.md" "$source_dir/dot_pi/agent/AGENTS.md"
copy_file "$HOME/.pi/agent/RTK.md" "$source_dir/dot_pi/agent/RTK.md"
copy_dir "$HOME/.pi/agent/agents" "$source_dir/dot_pi/agent/agents"
copy_dir "$HOME/.pi/agent/skills" "$source_dir/dot_pi/agent/skills" \
  --exclude '.git/' --exclude 'node_modules/' --exclude 'dist/' --exclude 'build/' --exclude 'deep-research/'
copy_dir "$HOME/.pi/agent/themes" "$source_dir/dot_pi/agent/themes"
copy_dir "$HOME/.pi/agent/extensions" "$source_dir/dot_pi/agent/extensions" \
  --exclude 'ruflo/' --exclude '.git/' --exclude 'node_modules/' --exclude 'dist/' --exclude 'build/'

# Shared DMS assets.
copy_dir "$HOME/.config/DankMaterialShell/themes" "$source_dir/private_dot_config/DankMaterialShell/themes"
copy_file "$HOME/.config/DankMaterialShell/zen.css" "$source_dir/private_dot_config/DankMaterialShell/zen.css"

# Host-specific apps/icons.
copy_dir "$HOME/.local/share/applications" "$source_dir/hosts/$host/dot_local/share/applications"
copy_dir "$HOME/.local/share/icons" "$source_dir/hosts/$host/dot_local/share/icons" \
  --exclude 'icon-theme.cache' --exclude '.cache/'
find "$source_dir/hosts/$host/dot_local/share/icons" -xtype l -delete 2>/dev/null || true

# Host-specific templates. Replace only current hostname block.
python3 - "$host" "$source_dir" <<'PY'
import re
import sys
from pathlib import Path

host = sys.argv[1]
source = Path(sys.argv[2])
home = Path.home()

pairs = [
    (home/'.pi/agent/settings.json', source/'dot_pi/agent/settings.json.tmpl'),
    (home/'.pi/agent/mcp.json', source/'dot_pi/agent/mcp.json.tmpl'),
    (home/'.config/DankMaterialShell/settings.json', source/'private_dot_config/DankMaterialShell/settings.json.tmpl'),
    (home/'.config/DankMaterialShell/clsettings.json', source/'private_dot_config/DankMaterialShell/clsettings.json.tmpl'),
    (home/'.config/DankMaterialShell/plugin_settings.json', source/'private_dot_config/DankMaterialShell/plugin_settings.json.tmpl'),
]

block_re = re.compile(
    r'(?ms)^\{\{-\s*(?:if|else if)\s+eq\s+\.chezmoi\.hostname\s+"(?P<host>[^"]+)"\s*-\}\}\n'
    r'(?P<body>.*?)'
    r'(?=^\{\{-\s*(?:else if\s+eq\s+\.chezmoi\.hostname\s+"[^"]+"|end)\s*-\}\})'
)

for target, tmpl in pairs:
    if not target.exists():
        continue
    body = target.read_text().rstrip() + '\n'
    new_block = f'{{{{- if eq .chezmoi.hostname "{host}" -}}}}\n{body}'

    tmpl.parent.mkdir(parents=True, exist_ok=True)
    if not tmpl.exists():
        tmpl.write_text(new_block + '{{- end -}}\n')
        continue

    text = tmpl.read_text()
    matches = list(block_re.finditer(text))
    replaced = False
    for m in reversed(matches):
        if m.group('host') == host:
            start, end = m.span()
            prefix = text[start:end].split('\n', 1)[0] + '\n'
            text = text[:start] + prefix + body + text[end:]
            replaced = True
            break

    if not replaced:
        end_marker = '{{- end -}}'
        insert = f'{{{{- else if eq .chezmoi.hostname "{host}" -}}}}\n{body}'
        if end_marker in text:
            text = text.replace(end_marker, insert + end_marker, 1)
        else:
            text = new_block + '{{- end -}}\n'

    tmpl.write_text(text if text.endswith('\n') else text + '\n')
PY

cd "$repo"

git add -A
if git diff --cached --quiet; then
  echo "chezpush: no changes to commit"
  exit 0
fi

git commit -m "$msg"
git push
