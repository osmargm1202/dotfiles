function orgm-hypr --description 'Run orgm-hypr on host from distrobox, or directly on host'
    if set -q CONTAINER_ID; or set -q DISTROBOX_ENTER_PATH; or set -q container; or test -f /.containerenv; or test -f /.dockerenv
        if command -q distrobox-host-exec
            command distrobox-host-exec orgm-hypr $argv
            return $status
        end
    end

    command orgm-hypr $argv
end
