function __tmux_init -d "Valida dependencias tmux e inicializa variables compartidas (herramienta_ia)"
    # Verificar entorno interactivo
    if not status is-interactive
        return 1
    end

    # Herramienta IA compartida
    set -gx herramienta_ia pi

    # Dependencias obligatorias comunes
    set -l missing 0
    for cmd in tmux $herramienta_ia
        if not type -q $cmd
            echo "Error: $cmd no está instalado."
            set missing 1
        end
    end

    if test $missing -eq 1
        return 1
    end

    return 0
end
