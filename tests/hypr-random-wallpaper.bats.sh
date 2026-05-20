#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRIPT="$REPO_DIR/config/shared/.local/bin/hypr-random-wallpaper"

fail() {
	echo "FAIL: $*" >&2
	exit 1
}

make_stub() {
	local dir="$1" name="$2" body="$3"
	printf '#!/usr/bin/env bash\nset -euo pipefail\n%s\n' "$body" >"$dir/bin/$name"
	chmod +x "$dir/bin/$name"
}

make_default_stubs() {
	local tmp="$1"
	mkdir -p "$tmp/bin" "$tmp/home/Pictures/Wallpapers" "$tmp/home/Videos/wallpapers" "$tmp/runtime" "$tmp/state"
	: >"$tmp/calls"

	make_stub "$tmp" hyprpaper 'echo "hyprpaper $*" >>"$CALLS"'
	make_stub "$tmp" mpvpaper 'echo "mpvpaper $*" >>"$CALLS"'
	make_stub "$tmp" pkill 'echo "pkill $*" >>"$CALLS"; exit 0'
	make_stub "$tmp" pgrep 'exit 1'
	make_stub "$tmp" sleep 'echo "sleep $*" >>"$CALLS"; exit 0'
	make_stub "$tmp" shuf 'head -n 1'
	make_stub "$tmp" notify-send 'echo "notify-send $*" >>"$CALLS"; exit 0'
	make_stub "$tmp" fuzzel 'cat >"$MENU"; printf "%s\n" "$PICK"'
}

run_script() {
	local tmp="$1" command="$2"
	PATH="$tmp/bin:/usr/bin:/bin" \
		CALLS="$tmp/calls" \
		MENU="$tmp/menu" \
		HOME="$tmp/home" \
		XDG_RUNTIME_DIR="$tmp/runtime" \
		XDG_STATE_HOME="$tmp/state" \
		HYPR_WALLPAPER_INTERVAL=999 \
		PICK="${PICK:-}" \
		/bin/sh "$SCRIPT" "$command" >"$tmp/out" 2>"$tmp/err"
}

assert_calls_contains() {
	local tmp="$1" pattern="$2" name="$3"
	grep -qE "$pattern" "$tmp/calls" || {
		dump_case "$tmp"
		fail "$name expected calls to match: $pattern"
	}
}

assert_calls_not_contains() {
	local tmp="$1" pattern="$2" name="$3"
	if grep -qE "$pattern" "$tmp/calls"; then
		dump_case "$tmp"
		fail "$name expected calls not to match: $pattern"
	fi
}

assert_file_contains() {
	local file="$1" pattern="$2" name="$3"
	grep -qE "$pattern" "$file" || {
		echo "--- $file ---" >&2
		cat "$file" >&2 2>/dev/null || true
		fail "$name expected file to match: $pattern"
	}
}

dump_case() {
	local tmp="$1"
	echo "--- calls ---" >&2
	cat "$tmp/calls" >&2 2>/dev/null || true
	echo "--- menu ---" >&2
	cat "$tmp/menu" >&2 2>/dev/null || true
	echo "--- stdout ---" >&2
	cat "$tmp/out" >&2 2>/dev/null || true
	echo "--- stderr ---" >&2
	cat "$tmp/err" >&2 2>/dev/null || true
}

with_tmp() {
	local tmp rc
	tmp="$(mktemp -d)"
	make_default_stubs "$tmp"
	"$@" "$tmp"
	rc=$?
	rm -rf "$tmp"
	return "$rc"
}

export SCRIPT
export -f fail make_stub make_default_stubs run_script \
	assert_calls_contains assert_calls_not_contains assert_file_contains \
	dump_case with_tmp

test_pick_video_uses_mpvpaper_and_persists_video_mode() {
	with_tmp bash -c '
    tmp="$1"
    home="$tmp/home"
    video="$home/Videos/wallpapers/live.mp4"
    touch "$video"
    PICK="Live: $video" run_script "$tmp" pick
    assert_calls_contains "$tmp" "pkill -x hyprpaper" "video mode stops static wallpaper"
    assert_calls_contains "$tmp" "mpvpaper -o no-audio loop hwdec=auto \* $video" "video mode starts mpvpaper"
    state="$tmp/state/hypr-wallpaper/state"
    assert_file_contains "$state" "^mode=video$" "video mode persisted"
    assert_file_contains "$state" "^path=$video$" "video path persisted"
  ' bash
}

test_pick_static_uses_hyprpaper_and_stops_mpvpaper() {
	with_tmp bash -c '
    tmp="$1"
    home="$tmp/home"
    image="$home/Pictures/Wallpapers/static.png"
    touch "$image"
    PICK="Normal: $image" run_script "$tmp" pick
    assert_calls_contains "$tmp" "pkill -x mpvpaper" "static mode stops live wallpaper"
    assert_calls_contains "$tmp" "hyprpaper -c $tmp/runtime/hypr-random-wallpaper.hyprpaper.conf" "static mode starts hyprpaper"
    state="$tmp/state/hypr-wallpaper/state"
    assert_file_contains "$state" "^mode=static$" "static mode persisted"
    assert_file_contains "$state" "^path=$image$" "static path persisted"
  ' bash
}

test_next_is_mode_aware_for_video_mode() {
	with_tmp bash -c '
    tmp="$1"
    home="$tmp/home"
    video="$home/Videos/wallpapers/next.mp4"
    touch "$video"
    mkdir -p "$tmp/state/hypr-wallpaper"
    printf "mode=video\npath=%s\n" "$video" >"$tmp/state/hypr-wallpaper/state"
    run_script "$tmp" next
    assert_calls_contains "$tmp" "mpvpaper -o no-audio loop hwdec=auto \* $video" "next in video mode keeps mpvpaper flow"
    assert_calls_not_contains "$tmp" "hyprpaper -c" "next in video mode does not start hyprpaper"
  ' bash
}

test_restore_uses_persisted_static_or_video_without_randomizing() {
	with_tmp bash -c '
    tmp="$1"
    home="$tmp/home"
    image="$home/Pictures/Wallpapers/kept.png"
    touch "$image" "$home/Pictures/Wallpapers/other.png"
    mkdir -p "$tmp/state/hypr-wallpaper"
    printf "mode=static\npath=%s\n" "$image" >"$tmp/state/hypr-wallpaper/state"
    run_script "$tmp" restore
    assert_calls_contains "$tmp" "hyprpaper -c $tmp/runtime/hypr-random-wallpaper.hyprpaper.conf" "restore static starts hyprpaper"
    assert_file_contains "$tmp/runtime/hypr-random-wallpaper.hyprpaper.conf" "$image" "restore keeps persisted static image"
  ' bash

	with_tmp bash -c '
    tmp="$1"
    home="$tmp/home"
    video="$home/Videos/wallpapers/kept.mp4"
    touch "$video" "$home/Videos/wallpapers/other.mp4"
    mkdir -p "$tmp/state/hypr-wallpaper"
    printf "mode=video\npath=%s\n" "$video" >"$tmp/state/hypr-wallpaper/state"
    run_script "$tmp" restore
    assert_calls_contains "$tmp" "mpvpaper -o no-audio loop hwdec=auto \* $video" "restore keeps persisted video"
  ' bash
}

test_pick_menu_lists_normal_and_live_sources() {
	with_tmp bash -c '
    tmp="$1"
    home="$tmp/home"
    image="$home/Pictures/Wallpapers/a.png"
    video="$home/Videos/wallpapers/a.mp4"
    touch "$image" "$video"
    PICK="Normal random" run_script "$tmp" pick
    assert_file_contains "$tmp/menu" "Normal random" "picker lists normal random"
    assert_file_contains "$tmp/menu" "Live random" "picker lists live random"
    assert_file_contains "$tmp/menu" "Normal: $image" "picker lists static image"
    assert_file_contains "$tmp/menu" "Live: $video" "picker lists live video"
  ' bash
}

test_pick_video_uses_mpvpaper_and_persists_video_mode
test_pick_static_uses_hyprpaper_and_stops_mpvpaper
test_next_is_mode_aware_for_video_mode
test_restore_uses_persisted_static_or_video_without_randomizing
test_pick_menu_lists_normal_and_live_sources

echo "hypr-random-wallpaper tests passed"
