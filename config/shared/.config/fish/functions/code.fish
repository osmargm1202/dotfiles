function code --wraps code --description 'Run VS Code from Arch distrobox on demand'
    if type -q distrobox-enter
        distrobox-enter arch -- code --disable-gpu $argv
    else
        command code --disable-gpu $argv
    end
end
