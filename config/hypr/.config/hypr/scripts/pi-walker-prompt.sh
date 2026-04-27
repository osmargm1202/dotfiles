#!/usr/bin/env bash
set -euo pipefail

PROMPT_TITLE="Pedir instrucción a Pi"
RESPONSE_TITLE="Respuesta de Pi"

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

show_response() {
	local text="$1"

	if command -v walker >/dev/null 2>&1; then
		printf '%s\n' "$text" | walker --dmenu -p "$RESPONSE_TITLE"
		return
	fi

	if command -v notify-send >/dev/null 2>&1; then
		notify-send "$RESPONSE_TITLE" "$text"
		return
	fi

	printf '%s\n' "$text"
}

input="$(ask_with_walker || true)"
if [ -z "$(printf '%s' "$input" | tr -d '[:space:]')" ]; then
	exit 0
fi

if ! command -v pi >/dev/null 2>&1; then
	if command -v notify-send >/dev/null 2>&1; then
		notify-send "Pi" "Comando 'pi' no encontrado en PATH"
	else
		printf "Comando 'pi' no encontrado en PATH\n" >&2
	fi
	exit 127
fi

response="$(pi -p "$input" 2>&1)"
show_response "$response"
