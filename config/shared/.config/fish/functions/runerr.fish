function runerr --description 'Ejecuta comando y guarda salida solo si falla'
    if test (count $argv) -eq 0
        echo "Uso: runerr <comando>"
        return 2
    end

    set -l cache_dir "$HOME/.cache"
    if set -q XDG_CACHE_HOME
        set cache_dir "$XDG_CACHE_HOME"
    end
    set -l err_file "$cache_dir/fish_last_error.log"
    mkdir -p $cache_dir

    # Ejecuta el comando y mantiene salida viva en terminal.
    eval $argv 2>&1 | tee $err_file
    set -l cmd_status $pipestatus[1]

    if test $cmd_status -ne 0
        set -g __fish_last_error_status $cmd_status
        set -g __fish_last_error_file $err_file
    else
        set -g __fish_last_error_status 0
        set -g __fish_last_error_file ''
    end

    return $cmd_status
end
