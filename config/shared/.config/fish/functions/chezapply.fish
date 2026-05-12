function chezapply --description 'Apply chezmoi config and restow remaining config packages'
    set -l source_dir (chezmoi source-path)
    set -l repo (string replace --regex '/chezmoi$' '' -- "$source_dir")
    set -l config_dir (string replace --regex '/chezmoi$' '/config' -- "$source_dir")

    if test "$repo" = "$source_dir"
        echo "chezapply: chezmoi source must end with /chezmoi: $source_dir" >&2
        return 1
    end

    if not test -d "$repo/.git"
        echo "chezapply: repo not found: $repo" >&2
        return 1
    end

    if not type -q stow
        echo "chezapply: missing dependency: stow" >&2
        return 127
    end

    echo "==> chezmoi apply"
    chezmoi apply; or return 1

    if not test -d "$config_dir"
        echo "chezapply: config dir not found: $config_dir" >&2
        return 1
    end

    echo "==> stow packages"
    set -l failed 0
    set -l applied 0
    set -l skipped 0

    pushd "$config_dir" >/dev/null; or return 1

    for package_path in */
        set -l package (string trim --right --chars=/ -- "$package_path")

        if not test -d "$package"
            set skipped (math $skipped + 1)
            continue
        end

        echo "==> stow -R --no-folding -t $HOME $package"
        if stow -R --no-folding -t "$HOME" "$package"
            echo "[ok] $package"
            set applied (math $applied + 1)
        else
            set -l status $status
            echo "[error] $package failed with exit code $status" >&2
            set failed (math $failed + 1)
        end
    end

    popd >/dev/null

    echo "==> summary: applied=$applied failed=$failed skipped=$skipped"

    if test $failed -gt 0
        return 1
    end
end
