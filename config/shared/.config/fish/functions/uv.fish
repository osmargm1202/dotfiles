function uv --wraps uv --description 'Run uv through the arch distrobox'
    distrobox-enter arch -- uv $argv
end
