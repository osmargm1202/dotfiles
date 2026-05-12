#!/usr/bin/env bash
set -euo pipefail

PROMPT="Cambiar a ventana"

if ! command -v hyprctl >/dev/null 2>&1; then
	exit 0
fi

entries=""

if command -v jq >/dev/null 2>&1; then
	entries=$(hyprctl clients -j | jq -r '.[] | "\(.address)\t\(.class)\t\(.title)"')
elif command -v python3 >/dev/null 2>&1; then
	entries=$(hyprctl clients -j | python3 -c '
import json
import sys

clients = json.load(sys.stdin)
rows = []
for c in clients:
    address = (c.get("address") or "").strip()
    cls = (c.get("class") or "").strip()
    title = (c.get("title") or "").strip().replace("\\n", " ")
    if address and title:
        rows.append(f"{address}\t{cls}\t{title}")

print("\\n".join(rows))
')
else
	# Fallback: parse legacy text output.
	entries=$(hyprctl clients | awk '
	/Window/ {
		if (match($0, /Window ([0-9a-fx]+)/, m)) {
			window=m[1]
		}
	}
	/^\s*class:\s*/ { class=$2 }
	/^\s*title:\s*/ {
		title=substr($0, index($0, "title:") + 7)
		gsub(/^\s*/, "", title)
		if (window != "" && class != "") {
			printf "%s\t%s\t%s\n", window, class, title
		}
	}
	')
fi

if [ -z "$entries" ]; then
	if command -v notify-send >/dev/null 2>&1; then
		notify-send "Walker" "No hay ventanas para listar"
	fi
	exit 0
fi

if command -v walker >/dev/null 2>&1; then
	selection=$(printf '%s\n' "$entries" | walker --dmenu -p "$PROMPT")
elif command -v rofi >/dev/null 2>&1; then
	selection=$(printf '%s\n' "$entries" | rofi -dmenu -p "$PROMPT")
else
	if command -v notify-send >/dev/null 2>&1; then
		notify-send "Walker" "Instalá walker (o rofi) para usar Alt+Tab"
	fi
	exit 0
fi

[ -z "$selection" ] && exit 0

addr=${selection%%$'\t'*}
if [ -n "$addr" ]; then
	hyprctl dispatch focuswindow "address:$addr"
fi
