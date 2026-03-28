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

    # Buscar si ya existe una sesión para ESTE directorio
    set -l existing_session ""
    for s in (tmux list-sessions -F '#{session_name}' 2>/dev/null)
        set -l s_dir (tmux show-options -t $s -vq @tmuxnew_dir 2>/dev/null)
        if test -z "$s_dir"
            # fallback para sesiones viejas sin metadata
            set s_dir (tmux display-message -p -t "$s:0.0" '#{pane_current_path}' 2>/dev/null)
        end

        if test "$s_dir" = "$target_dir"
            set existing_session $s
            break
        end
    end

    # Si ya existe sesión para este directorio, entrar a esa
    if test -n "$existing_session"
        echo "Entrando a la sesión existente '$existing_session' en: $target_dir"
        tmux attach-session -t $existing_session
        return 0
    end

    # Nombre base de sesión usando las últimas 3 carpetas (padre2_padre1_actual)
    set -l parts (string split '/' -- $target_dir)
    set -l clean_parts
    for p in $parts
        if test -n "$p"
            set -a clean_parts $p
        end
    end

    set -l tail_parts
    if test (count $clean_parts) -ge 3
        set tail_parts $clean_parts[-3..-1]
    else
        set tail_parts $clean_parts
    end

    set -l session_base (string join '_' $tail_parts | string replace -ar '[^a-zA-Z0-9_-]' '_')
    if test -z "$session_base"
        set session_base "workspace"
    end

    set -l session_name $session_base

    # Si existe ese nombre pero de otra carpeta, usar sufijo incremental
    if tmux has-session -t $session_name 2>/dev/null
        set -l i 2
        while tmux has-session -t "$session_base"_"$i" 2>/dev/null
            set i (math $i + 1)
        end
        set session_name "$session_base"_"$i"
    end

    echo "Creando sesión tmux '$session_name' en: $target_dir"

    # Crear sesión con opencode ya ejecutándose en el panel 0
    tmux new-session -d -s $session_name -c $target_dir "opencode"

    # Guardar metadata del directorio para reutilizar la sesión luego
    tmux set-option -t $session_name @tmuxnew_dir "$target_dir" >/dev/null

    # Layout 2x2 exacto:
    # ┌──────────────────────┬──────────────────────┐
    # │ arriba izquierda     │ arriba derecha       │
    # │ opencode             │ terminal             │
    # ├──────────────────────┼──────────────────────┤
    # │ abajo izquierda      │ abajo derecha        │
    # │ terminal             │ yazi                 │
    # └──────────────────────┴──────────────────────┘

    # Tomar pane inicial (opencode)
    set -l pane_opencode (tmux display-message -p -t $session_name:0.0 '#{pane_id}')

    # Crear pane arriba derecha (terminal)
    set -l pane_top_right (tmux split-window -h -P -F '#{pane_id}' -t $pane_opencode -c $target_dir)

    # Crear pane abajo izquierda (terminal)
    set -l pane_bottom_left (tmux split-window -v -P -F '#{pane_id}' -t $pane_opencode -c $target_dir)

    # Crear pane abajo derecha (yazi)
    set -l pane_bottom_right (tmux split-window -v -P -F '#{pane_id}' -t $pane_top_right -c $target_dir "yazi")

    # Hacer el main más angosto (como cuando lo ajustás manualmente)
    tmux set-window-option -t $session_name:0 main-pane-width '35%' >/dev/null

    # Aplicar layout main-vertical-mirrored (equivalente a C-a M-7)
    tmux select-layout -t $session_name:0 main-vertical-mirrored

    # Foco por defecto: terminal abajo izquierda
    tmux select-pane -t $pane_bottom_left

    # Adjuntarse
    tmux attach-session -t $session_name
end
