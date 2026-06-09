function claude --wraps claude --description 'Run Claude Code from Arch distrobox with no permission prompts'
    if type -q distrobox-enter
        distrobox-enter arch -- fish -lc 'if type -q fnm; fnm env --shell fish | source; end; command claude --dangerously-skip-permissions $argv' -- $argv
    else
        if type -q fnm
            fnm env --shell fish | source
        end
        command claude --dangerously-skip-permissions $argv
    end
end
