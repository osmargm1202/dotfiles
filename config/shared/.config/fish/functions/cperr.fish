function cperr --description 'Copia al portapapeles la salida del último error'
    if not set -q __fish_last_error_status
        echo "No hay historial de errores guardado. Usa runerr primero."
        return 1
    end

    if test "$__fish_last_error_status" -eq 0
        echo "Último comando terminó bien. Sin error para copiar."
        return 1
    end

    if test -z "$__fish_last_error_file"; or not test -f "$__fish_last_error_file"
        echo "No hay archivo de error disponible."
        return 1
    end

    if command -q wl-copy
        cat "$__fish_last_error_file" | wl-copy
    else if command -q xclip
        cat "$__fish_last_error_file" | xclip -selection clipboard
    else
        echo "Instala wl-copy o xclip para copiar al portapapeles."
        return 1
    end

    echo "Último error copiado al portapapeles."
    return 0
end
