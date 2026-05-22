function pnpm --wraps pnpm --description 'Run pnpm through the arch distrobox'
    distrobox-enter arch -- pnpm $argv
end
