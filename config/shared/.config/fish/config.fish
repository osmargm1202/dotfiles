function fish_greeting
    set RED '\033[38;5;196m'
    set ORANGE '\033[38;5;202m'
    set YELLOW '\033[38;5;226m'
    set GREEN '\033[38;5;082m'
    set TEAL '\033[1;36m'
    set BLUE '\033[38;2;0;119;182m'
    set PURPLE '\033[38;5;093m'
    set PINK '\033[38;5;163m'
    set RESET '\033[0m'

    printf "\n"
    printf "%bO %bR %bG %bM   %bN %bi %bx %bO %bS%b\n" \
        $BLUE $BLUE $BLUE $BLUE \
        $RED $ORANGE $YELLOW $GREEN $TEAL \
        $RESET
end

# if not set -q TMUX
#     if type -q fastfetch
#         # Fastfetch local disponible
#         fastfetch
#     end
# end

if test -f ~/.config/fish/age.fish
    source ~/.config/fish/age.fish
end

if test -f ~/.config/fish/age-host.fish
    source ~/.config/fish/age-host.fish
end

set -l host_config ~/.config/fish/host-(hostname).fish
if test -f $host_config
    source $host_config
end

if functions -q load_private_env
    load_private_env
end

if test -f ~/.config/fish/insforge.env
    source ~/.config/fish/insforge.env
end

# PATH
set -gx PATH $HOME/.local/bin $PATH
set -gx PATH $HOME/.cargo/bin $PATH
set -gx PATH $HOME/go/bin $PATH

# Node: en el host usa pnpm por defecto; dentro de distrobox no carga el wrapper.
if not set -q DISTROBOX_ENTER_PATH
    alias npm="pnpm"
end

# Nix cleanup helpers.
alias nixgc='sudo nix-collect-garbage -d'
function nixg
    set -l keep 2
    if test (count $argv) -gt 0
        set keep $argv[1]
    end
    sudo nix-env --profile /nix/var/nix/profiles/system --delete-generations +$keep
end

function nixclean
    nixg 2
    nixgc
end

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
#
if type -q nvim
    set EDITOR nvim
    alias fishconfig='nvim ~/.config/fish/config.fish'
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
# Ejecutado una vez como variable universal, no en cada inicio.

if type -q curl; and type -q fzf; and type -q bat
    function cheat
        curl -s cheat.sh/:list | fzf --preview "curl -s cheat.sh/{}" --preview-window=right:70% | xargs -I {} curl -s cheat.sh/{} | bat --language=markdown --paging=always
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
