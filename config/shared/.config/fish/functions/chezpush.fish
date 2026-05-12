function chezpush --description 'Re-add chezmoi-managed dotfiles, commit, and push'
    set -l host (hostname)
    set -l source_dir (chezmoi source-path)
    set -l repo (string replace --regex '/chezmoi$' '' -- "$source_dir")
    set -l msg

    if test (count $argv) -gt 0
        set msg (string join ' ' -- $argv)
    else
        set msg "sync $host config"
    end

    if test "$repo" = "$source_dir"
        echo "chezpush: chezmoi source must end with /chezmoi: $source_dir" >&2
        return 1
    end

    if not test -d "$repo/.git"
        echo "chezpush: repo not found: $repo" >&2
        return 1
    end

    # Re-capture all normal chezmoi-managed files.
    chezmoi re-add; or return 1

    # Encrypted secret. Keep auth.json out; private-env.fish encrypted.
    if test -f "$HOME/.config/fish/private-env.fish"
        chezmoi add --encrypt "$HOME/.config/fish/private-env.fish"; or return 1
    end

    function __chezpush_copy_dir
        set -l src $argv[1]
        set -l dst $argv[2]
        set -l extra $argv[3..-1]
        test -d "$src"; or return 0
        mkdir -p "$dst"
        rsync -a --delete $extra "$src/" "$dst/"
    end

    # Host-specific apps/icons live under chezmoi/hosts/<hostname>, copied by run_after script.
    __chezpush_copy_dir "$HOME/.local/share/applications" "$source_dir/hosts/$host/dot_local/share/applications"
    __chezpush_copy_dir "$HOME/.local/share/icons" "$source_dir/hosts/$host/dot_local/share/icons" --exclude 'icon-theme.cache' --exclude '.cache/'
    find "$source_dir/hosts/$host/dot_local/share/icons" -xtype l -delete 2>/dev/null; or true

    # Host-specific templates. Replace only current hostname block.
    python3 -c '
import re
import sys
from pathlib import Path

host = sys.argv[1]
source = Path(sys.argv[2])
home = Path.home()

pairs = [
    (home/".pi/agent/settings.json", source/"dot_pi/agent/settings.json.tmpl"),
    (home/".pi/agent/mcp.json", source/"dot_pi/agent/mcp.json.tmpl"),
    (home/".config/DankMaterialShell/settings.json", source/"private_dot_config/DankMaterialShell/settings.json.tmpl"),
    (home/".config/DankMaterialShell/clsettings.json", source/"private_dot_config/DankMaterialShell/clsettings.json.tmpl"),
    (home/".config/DankMaterialShell/plugin_settings.json", source/"private_dot_config/DankMaterialShell/plugin_settings.json.tmpl"),
]

block_re = re.compile(
    r"(?ms)^\{\{-\s*(?:if|else if)\s+eq\s+\.chezmoi\.hostname\s+\"(?P<host>[^\"]+)\"\s*-\}\}\n"
    r"(?P<body>.*?)"
    r"(?=^\{\{-\s*(?:else if\s+eq\s+\.chezmoi\.hostname\s+\"[^\"]+\"|end)\s*-\}\})"
)

for target, tmpl in pairs:
    if not target.exists():
        continue
    body = target.read_text().rstrip() + "\n"
    new_block = f"{{{{- if eq .chezmoi.hostname \"{host}\" -}}}}\n{body}"

    tmpl.parent.mkdir(parents=True, exist_ok=True)
    if not tmpl.exists():
        tmpl.write_text(new_block + "{{- end -}}\n")
        continue

    text = tmpl.read_text()
    matches = list(block_re.finditer(text))
    replaced = False
    for m in reversed(matches):
        if m.group("host") == host:
            start, end = m.span()
            prefix = text[start:end].split("\n", 1)[0] + "\n"
            text = text[:start] + prefix + body + text[end:]
            replaced = True
            break

    if not replaced:
        end_marker = "{{- end -}}"
        insert = f"{{{{- else if eq .chezmoi.hostname \"{host}\" -}}}}\n{body}"
        if end_marker in text:
            text = text.replace(end_marker, insert + end_marker, 1)
        else:
            text = new_block + "{{- end -}}\n"

    tmpl.write_text(text if text.endswith("\n") else text + "\n")
' "$host" "$source_dir"; or return 1

    cd "$repo"; or return 1
    git add -A
    if git diff --cached --quiet
        echo "chezpush: no changes to commit"
        return 0
    end

    git commit -m "$msg"; or return 1
    git push
end
