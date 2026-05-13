function npx --wraps pnpx --description 'Run npx through pnpx from Arch distrobox on demand'
    if type -q distrobox-enter
        distrobox-enter arch -- fish -lc 'if type -q fnm; fnm env --shell fish | source; end; command pnpx $argv' -- $argv
    else
        if type -q fnm
            fnm env --shell fish | source
        end
        command pnpx $argv
    end
end
