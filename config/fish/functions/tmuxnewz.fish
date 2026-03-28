function tmuxnewz
    # Verificar entorno interactivo
    if not status is-interactive
        return 1
    end

    # Verificar dependencias
    if not type -q tmux
        echo "Error: tmux no está instalado."
        return 1
    end

    if not type -q yazi
        echo "Error: yazi no está instalado."
        return 1
    end

    if not type -q opencode
        echo "Error: opencode no está instalado."
        return 1
    end

    if not type -q zoxide
        echo "Error: zoxide no está instalado."
        return 1
    end

    if not type -q fzf
        echo "Error: fzf no está instalado. Necesario para seleccionar directorios."
        return 1
    end

    set -l dir_file "$HOME/.config/fish/functions/dir.txt"
    set -l target_dir

    # Obtener directorios de zoxide
    set -l zoxide_dirs (zoxide query -l 2>/dev/null)

    if test -z "$zoxide_dirs"
        echo "No hay directorios en el historial de zoxide."
        return 1
    end

    # Usar fzf para seleccionar y filtrar directorios de zoxide
    set target_dir (printf '%s\n' $zoxide_dirs | fzf --prompt "Selecciona directorio (zoxide): " --height 50% --reverse --preview 'ls -la {}' --preview-window=right:30%)

    if test -z "$target_dir"
        echo "No se seleccionó ningún directorio."
        return 0
    end

    # Expandir path
    set target_dir (realpath $target_dir 2>/dev/null; or echo $target_dir)

    # Verificar que el directorio existe
    if not test -d $target_dir
        echo "Error: El directorio '$target_dir' no existe."
        return 1
    end

    # Crear archivo de directorios si no existe
    if not test -f $dir_file
        touch $dir_file
    end

    # Guardar el directorio en el archivo
    echo $target_dir >> $dir_file

    # Generar nombre de sesión único
    set -l session_name (basename $target_dir | tr '.' '_')_(date +%s)

    echo "Creando sesión tmux '$session_name' en: $target_dir"

    # Crear sesión con opencode ya ejecutándose en el panel 0
    tmux new-session -d -s $session_name -c $target_dir "opencode"

    # Layout:
    # ┌─────────────────────────────┐
    # │        Panel 0              │ ← opencode (40% altura)
    # ├───────────┬─────────────────┤
    # │ Panel 1   │    Panel 2      │
    # │ terminal  │    yazi         │
    # └───────────┴─────────────────┘

    # Dividir horizontalmente: Panel 0 y Panel 1 (terminal)
    tmux split-window -v -t $session_name:0.0 -c $target_dir

    # Dividir el panel inferior: Panel 1 (izq terminal) y Panel 2 (der yazi)
    tmux split-window -h -t $session_name:0.1 -c $target_dir "yazi"

    # Ajustar tamaño del panel superior (opencode) a 40%
    tmux resize-pane -t $session_name:0.0 -y 40%

    # Seleccionar el panel de la terminal (panel 1, abajo izquierda) por defecto
    tmux select-pane -t $session_name:0.1

    # Adjuntarse
    tmux attach-session -t $session_name
end
