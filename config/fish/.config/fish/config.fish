if not set -q TMUX
    if type -q fastfetch
        # Fastfetch local disponible
        fastfetch
    end
end

set -gx AGE_KEY_FILE "$HOME/Nextcloud/Documentos/keys/age.txt"

if test -f ~/.config/fish/private-env.fish
    source ~/.config/fish/private-env.fish
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

if type -q git
    function dotpush
        cd ~/Hobby/dotfiles && git add . && git commit -m "$argv" && git push
    end
    alias gst="git status"
    alias gdiff="git diff"
    function gp
        git add .
        git commit -m "$argv"
        git push
    end
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
    alias fd="fd --hidden --exclude .git"
end

# ipinfo (información de IP), solo si 'curl' está instalado
if type -q curl
    alias ipinfo="curl -s ipinfo.io"
end

# set TERM xterm-256color

if type -q nano
    set EDITOR nano
    alias fishconfig='nano ~/.config/fish/config.fish'
    alias kittyconfig='nano ~/.config/kitty/kitty.conf'
    alias ffconfig='nano ~/.config/fastfetch/config.jsonc'
end

#if type -q vim
#   set EDITOR vim
#   alias fishconfig='vim ~/.config/fish/config.fish'
#   alias kittyconfig='vim ~/.config/kitty/kitty.conf'
#   alias ffconfig='vim ~/.config/fastfetch/config.jsonc'
#end

if type -q nvim
    set EDITOR nvim
    alias fishconfig='nvim ~/.config/fish/config.fish'
    alias kittyconfig='nvim ~/.config/kitty/kitty.conf'
    alias ffconfig='nvim ~/.config/fastfetch/config.jsonc'
end

# history search (ctrl+r mejorado con fzf si lo instalas)
if type -q fzf
    set FZF_DEFAULT_OPTS "--height=50% --reverse --inline-info --border --color=fg:15,bg:0"
    function fish_user_key_bindings
        bind \cr fzf_history
    end
end

if type -q yazi
    alias y='yazi'
end

# Tmux session selector con gum
if type -q gum; and type -q tmux
    source ~/.config/fish/functions/tmuxls.fish
    source ~/.config/fish/functions/tmuxdel.fish
end

# Helper compartido (valida tmux para helpers tmux)
source ~/.config/fish/functions/__tmux_init.fish
source ~/.config/fish/functions/__tmux_shared.fish

# Tmux new session (ventana única)
source ~/.config/fish/functions/tmuxnew.fish

# Tmux selector de directorios desde cwd con fzf + fd
if type -q fzf; and type -q fd
    source ~/.config/fish/functions/tmuxfd.fish
end

# Tmux new session usando zoxide + fzf
if type -q zoxide; and type -q fzf
    source ~/.config/fish/functions/tmuxnewz.fish
end

# Deshabilitar mensaje de ayuda de fish
set -U fish_greeting ""

if type -q curl; and type -q fzf; and type -q bat
    function cheat
        curl -s cheat.sh/:list | fzf --preview "curl -s cheat.sh/{}" --preview-window=right:70% | xargs -I {} curl -s cheat.sh/{} | bat --language=markdown --paging=always
    end
end

if not set -q DISTROBOX_ENTER_PATH
    if string match -q "*arch*" (distrobox-list)
        distrobox-enter arch -- fastfetch --logo arch
        if type -q distrobox-enter arch -- zoxide
            distrobox-enter arch -- zoxide init fish | source
            alias cd="z"
        end
        function nvim
            distrobox-enter arch -- nvim $argv
        end
        function bat
            distrobox-enter arch -- bat $argv
        end
        function helix
            distrobox-enter arch -- helix $argv
        end
        function git
            distrobox-enter arch -- git $argv
        end
        function gh
            distrobox-enter arch -- gh $argv
        end
        function fd
            distrobox-enter arch -- fd $argv
        end
        function rg
            distrobox-enter arch -- rg $argv
        end
        function fzf
            distrobox-enter arch -- fzf $argv
        end
        function go
            distrobox-enter arch -- go $argv
        end
        function uv
            distrobox-enter arch -- uv $argv
        end
        function npm
            distrobox-enter arch -- npm $argv
        end
        function paru
            distrobox enter arch -- paru $argv
        end
        function rust
            distrobox-enter arch -- rust $argv
        end
        function cargo
            distrobox-enter arch -- cargo $argv
        end
        function stow
            distrobox-enter arch -- stow $argv
        end
        function tmux
            distrobox-enter arch -- tmux $argv
        end
        function pi
            distrobox-enter arch -- pi $argv
        end
        function fnm
            distrobox-enter arch -- fnm $argv
        end
        function orgmrnc
            distrobox-enter arch -- orgmrnc $argv
        end
        function orgmcalc
            distrobox-enter arch -- orgmrnc $argv
        end
        function orgmorg
            distrobox-enter arch -- orgmorg $argv
        end
        function orgmos
            distrobox-enter arch -- orgmos $argv
        end
        function mypy
            distrobox-enter arch -- mypy $argv
        end
        function ty
            distrobox-enter arch -- ty $argv
        end
        function ruff
            distrobox-enter arch -- ruff $argv
        end
        function pyrefly
            distrobox-enter arch -- pyrefly $argv
        end
        function yazi
            distrobox-enter arch -- yazi $argv
        end
        function jq
            distrobox-enter arch -- jq $argv
        end
        alias y='distrobox-enter arch -- yazi'
        alias ls='distrobox-enter arch -- eza --group-directories-first --icons'
        alias ll='distrobox-enter arch -- eza -la --group-directories-first --icons'
        alias lt='distrobox-enter arch -- eza --tree --group-directories-first --icons'
        alias fishconfig='distrobox-enter arch -- nvim ~/.config/fish/config.fish'
        alias kittyconfig='distrobox-enter arch -- nvim ~/.config/kitty/kitty.conf'
        alias ffconfig'=distrobox-enter arch -- nvim ~/.config/fastfetch/config.jsonc'

    end
end

function g
    set -l query (string join '+' $argv)
    xdg-open "https://www.google.com/search?q=$query"
    exit
end

function yt
    set -l query (string join '+' $argv)
    xdg-open "https://www.youtube.com/results?search_query=$query"
    exit
end
