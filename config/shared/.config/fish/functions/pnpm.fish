function pnpm --wraps pnpm --description 'Run pnpm from Arch distrobox on demand with fnm env'
    if type -q distrobox-enter
        distrobox-enter arch -- fish -lc 'if type -q fnm; fnm env --shell fish | source; end; command pnpm $argv' -- $argv
    else
        if type -q fnm
            fnm env --shell fish | source
        end
        command pnpm $argv
    end
end
