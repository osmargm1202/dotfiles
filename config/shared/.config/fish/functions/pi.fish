function pi --wraps pi --description 'Run pi from Arch distrobox on demand with fnm env'
    if type -q distrobox-enter
        distrobox-enter arch -- fish -lc 'if type -q fnm; fnm env --shell fish | source; end; command pi $argv' -- $argv
    else
        if type -q fnm
            fnm env --shell fish | source
        end
        command pi $argv
    end
end
