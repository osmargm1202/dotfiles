# ORGM-specific shortcuts.
alias dotd='orgm-dot diff'
alias dots='orgm-dot sync'

set -gx HELPER_SCALE 1.00

# NixOS rebuild shortcuts.
alias os='nh os switch /home/osmarg/Hobby/dotfiles/ --hostname orgm-hyprland'
alias osb='nh os build /home/osmarg/Hobby/dotfiles/ --hostname orgm-hyprland'
alias oss='nh os switch /home/osmarg/Hobby/dotfiles/ --hostname orgm-hyprland'
alias ossu='nh os switch /home/osmarg/Hobby/dotfiles/ --hostname orgm-hyprland --update'
alias osbu='nh os build /home/osmarg/Hobby/dotfiles/ --hostname orgm-hyprland --update'
