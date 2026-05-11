#!/bin/sh

layout=$(swaymsg -t get_inputs 2>/dev/null \
  | awk -F'"' '/"xkb_active_layout_name"/ { print $4; exit }')

case "$layout" in
  *Spanish*Latin*|*latam*|*Latam*) text="LATAM" ;;
  *English*|*US*|*us*) text="US" ;;
  "") text="--" ;;
  *) text=$(printf '%s' "$layout" | tr '[:lower:]' '[:upper:]' | awk '{ print $1 }') ;;
esac

printf '%s\n' "$text"
