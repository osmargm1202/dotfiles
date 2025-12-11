if status is-interactive
    if type -q fastfetch
        if test -f ~/.config/fastfetch/config.jsonc
            fastfetch --config ~/.config/fastfetch/config.jsonc
        else if test -f ~/.config/fastfetch/orgm.png
            fastfetch --logo-path ~/.config/fastfetch/orgm.png
        else
            fastfetch
        end
    end
end

if test -f ~/.config/fish/conf.d/docker.fish
    source ~/.config/fish/conf.d/docker.fish
end

if status --is-login
    set -gx PATH $PATH ~/linux/bin
end

# PATH
set -gx PATH $HOME/.local/bin $PATH

set -gx PATH $HOME/go/bin $PATH

# Prompt más vistoso (starship opcional)
if type -q starship
    starship init fish | source
end

# zoxide (cd inteligente)
if type -q zoxide
    zoxide init fish | source
    alias cd="z"
end

# eza (ls mejorado), solo si está instalado
if type -q eza
    alias ls="eza --group-directories-first --icons"
    alias ll="eza -la --group-directories-first --icons"
    alias lt="eza --tree --group-directories-first --icons"

else
    alias ll="ls -la"
    alias ls="ls -l"
    alias lt="ls -lah"
end

# ripgrep (buscar rápido), solo si está instalado
if type -q rg
    alias rg="rg --hidden --glob '!.git/*'"
end

# fd (buscar archivos mejor que find), solo si está instalado
if type -q fd
    alias f="fd --hidden --exclude .git"
end

# ipinfo (información de IP), solo si 'curl' está instalado
if type -q curl
    alias ipinfo="curl -s ipinfo.io"
end

# peaclock (reloj digital con configuración personalizada)
if type -q peaclock
    if test -f ~/.config/peaclock/config
        alias clock="peaclock --config-dir ~/.config/peaclock"
    else
        alias clock="peaclock"
    end
end

set TERM xterm-256color


if type -q nano
    set EDITOR nano
end

if type -q vi
    set EDITOR vi
end

if type -q nvim
    set EDITOR nvim
end
# si fedora es el sistema operativo

function tba
    if test (count $argv) -gt 0
        toolbox run --container arch fish -c "$argv"
    else
        toolbox run --container arch fish
    end
end

function tbo
    if test (count $argv) -gt 0
        toolbox run --container orgm fish -c "$argv"
    else
        toolbox run --container orgm fish
    end
end

# history search (ctrl+r mejorado con fzf si lo instalas)
if type -q fzf
    set FZF_DEFAULT_OPTS "--height=50% --reverse --inline-info --border --color=fg:15,bg:0"
    function fish_user_key_bindings
        bind \cr fzf_history
    end
end

# Deshabilitar mensaje de ayuda de fish
set -U fish_greeting ""

if type -q curl; and type -q fzf; and type -q bat
    function cheat
        curl -s cheat.sh/:list | fzf --preview "curl -s cheat.sh/{}" --preview-window=right:70% | xargs -I {} curl -s cheat.sh/{} | bat --language=markdown --paging=always
    end
end


# The next line updates PATH for the Google Cloud SDK.
if test -f '/home/osmar/google-cloud-sdk/path.fish.inc'
    . '/home/osmar/google-cloud-sdk/path.fish.inc'
end
