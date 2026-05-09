function chezpush --description 'Capture chezmoi-managed dotfiles, commit, and push'
    set -l repo "$HOME/Hobby/dotfiles"
    set -l msg

    if test (count $argv) -gt 0
        set msg (string join ' ' -- $argv)
    else
        set msg "sync "(hostname)" config"
    end

    if not test -x "$repo/chezmoi/sync-push.sh"
        echo "chezpush: script not found or not executable: $repo/chezmoi/sync-push.sh" >&2
        return 1
    end

    "$repo/chezmoi/sync-push.sh" "$msg"
end
