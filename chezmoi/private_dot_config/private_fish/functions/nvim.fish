function nvim --wraps nvim --description 'Run nvim from Arch distrobox on demand with fnm env'
    if type -q distrobox-enter
        distrobox-enter arch -- fish -lc 'if type -q fnm; fnm env --shell fish | source; end; command nvim $argv' -- $argv
    else
        if type -q fnm
            fnm env --shell fish | source
        end
        command nvim $argv
    end
end
