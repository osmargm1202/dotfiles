function chezedit --description 'Edit local chezmoi config file'
    set -l config "$HOME/.config/chezmoi/chezmoi.toml"
    set -l editor

    if set -q EDITOR
        set editor $EDITOR
    else if type -q nano
        set editor nano
    else if type -q nvim
        set editor nvim
    else if type -q vim
        set editor vim
    else
        echo "chezedit: no editor found; set EDITOR" >&2
        return 1
    end

    mkdir -p (dirname "$config")
    if not test -f "$config"
        chezinit; or return 1
    end

    $editor "$config"
end
