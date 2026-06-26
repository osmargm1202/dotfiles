function uv --wraps uv --description 'Run uv through the arch distrobox, or directly if already inside'
    if command -q distrobox-enter
        distrobox-enter arch -- uv $argv
    else
        command uv $argv
    end
end
