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

    if cat "$__fish_last_error_file" | clipboard_copy
        echo "Último error copiado al portapapeles."
        return 0
    end

    echo "No se pudo copiar al portapapeles. Instalá wl-copy/xclip en host/guest o revisá entorno."
    return 1
end
