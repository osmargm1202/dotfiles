function zeditor --wraps zeditor --description 'Run zeditor from Arch distrobox on demand'
    if type -q distrobox-enter
        distrobox-enter arch -- zeditor $argv
    else
        command zeditor $argv
    end
end
