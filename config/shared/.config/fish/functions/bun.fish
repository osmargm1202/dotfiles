function bun --wraps bun --description 'Run bun through the arch distrobox'
    distrobox-enter arch -- bun $argv
end
