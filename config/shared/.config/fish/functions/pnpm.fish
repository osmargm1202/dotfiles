function pnpm --wraps pnpm --description 'Run pnpm through the arch distrobox from the host only'
    if set -q DISTROBOX_ENTER_PATH
        command pnpm $argv
    else if type -q distrobox-enter
        distrobox-enter arch -- pnpm $argv
    else
        command pnpm $argv
    end
end
