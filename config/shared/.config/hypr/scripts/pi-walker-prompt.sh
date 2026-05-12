#!/usr/bin/env bash
set -euo pipefail

PROMPT_TITLE="Pedir instrucción a Pi"

ask_with_walker() {
	if command -v walker >/dev/null 2>&1; then
		walker --dmenu -p "$PROMPT_TITLE"
		return
	fi

	if command -v rofi >/dev/null 2>&1; then
		rofi -dmenu -p "$PROMPT_TITLE"
		return
	fi

	printf "%s: " "$PROMPT_TITLE"
	read -r input
	printf "%s" "$input"
}

input="$(ask_with_walker || true)"
if [ -z "$(printf '%s' "$input" | tr -d '[:space:]')" ]; then
	exit 0
fi

if ! command -v kitty >/dev/null 2>&1; then
	echo "Comando 'kitty' no encontrado en PATH" >&2
	exit 127
fi

if ! command -v distrobox-enter >/dev/null 2>&1; then
	echo "Comando 'distrobox-enter' no encontrado en PATH" >&2
	exit 127
fi

kitty --class kitty --hold -e distrobox-enter arch -- pi "$input"
