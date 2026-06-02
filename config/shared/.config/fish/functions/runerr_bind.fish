function runerr_bind --description 'Ejecuta la línea actual con runerr'
    set -l cmd (commandline)

    if test -z (string trim -- "$cmd")
        commandline -f execute
        return
    end

    commandline -r ''
    history append -- $cmd
    runerr "$cmd"
    commandline -f repaint
    return $status
end
