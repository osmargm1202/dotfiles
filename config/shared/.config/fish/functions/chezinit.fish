function chezinit --description 'Initialize local chezmoi config for this dotfiles repo'
    set -l source_dir
    set -l age_identity
    set -l age_recipient "age1hmnr736sfpqqs02j8zgaydm9r8c8cw9f5eek644rwvlygkgknaxqe64kx7"
    set -l config "$HOME/.config/chezmoi/chezmoi.toml"

    if test (count $argv) -ge 1
        set source_dir $argv[1]
    else
        set source_dir (pwd)/chezmoi
        if not test -d "$source_dir"
            set source_dir "$HOME/Hobby/dotfiles/chezmoi"
        end
    end

    if test (count $argv) -ge 2
        set age_identity $argv[2]
    else
        set age_identity "$HOME/Nextcloud/Documentos/keys/age.txt"
    end

    if not test -d "$source_dir"
        echo "chezinit: source dir not found: $source_dir" >&2
        echo "usage: chezinit [source_dir] [age_identity]" >&2
        return 1
    end

    mkdir -p (dirname "$config")

    printf '%s\n' \
        "sourceDir = \"$source_dir\"" \
        'encryption = "age"' \
        '' \
        '[age]' \
        "recipient = \"$age_recipient\"" \
        "identity = \"$age_identity\"" \
        > "$config"

    echo "chezinit: wrote ~/.config/chezmoi/chezmoi.toml"
    chezmoi source-path
end
