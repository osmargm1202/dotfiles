#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TEMP_DIRS=()
TEST_COUNT=0

cleanup() {
	local dir
	for dir in "${TEMP_DIRS[@]}"; do
		[[ -d "$dir" ]] && rm -rf "$dir"
	done
}
trap cleanup EXIT

fail() {
	printf 'FAIL: %s\n' "$*" >&2
	exit 1
}

assert_contains() {
	local haystack=$1
	local needle=$2
	local message=${3:-"expected output to contain [$needle]"}
	[[ "$haystack" == *"$needle"* ]] || fail "$message"
}

assert_not_contains() {
	local haystack=$1
	local needle=$2
	local message=${3:-"expected output to exclude [$needle]"}
	[[ "$haystack" != *"$needle"* ]] || fail "$message"
}

assert_equals() {
	local actual=$1
	local expected=$2
	local message=${3:-"expected [$expected], got [$actual]"}
	[[ "$actual" == "$expected" ]] || fail "$message"
}

assert_order() {
	local haystack=$1
	local first=$2
	local second=$3
	local first_part=${haystack%%"$first"*}
	[[ "$haystack" == *"$first"* ]] || fail "missing first marker [$first]"
	[[ "$haystack" == *"$second"* ]] || fail "missing second marker [$second]"
	local after_first=${haystack#*"$first"}
	[[ "$after_first" == *"$second"* ]] || fail "expected [$first] before [$second]"
	: "$first_part"
}

assert_file_empty() {
	local path=$1
	[[ ! -e "$path" || ! -s "$path" ]] || fail "expected empty file [$path]"
}

link_real_command() {
	local sandbox=$1
	local command_name=$2
	ln -s "$(command -v "$command_name")" "$sandbox/fakebin/$command_name"
}

create_fake_paru() {
	local path=$1
	cat >"$path" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'FAKE %s %s\n' "$0" "$*" >>"$TEST_LOG"
EOF
	chmod +x "$path"
}

setup_sandbox() {
	local sandbox
	sandbox=$(mktemp -d)
	TEMP_DIRS+=("$sandbox")
	mkdir -p "$sandbox/fakebin"
	link_real_command "$sandbox" bash
	link_real_command "$sandbox" cat
	link_real_command "$sandbox" chmod
	link_real_command "$sandbox" dirname
	link_real_command "$sandbox" mkdir
	link_real_command "$sandbox" mktemp
	link_real_command "$sandbox" rm
	link_real_command "$sandbox" sort
	cp "$SCRIPT_DIR/install.sh" "$sandbox/install.sh"
	chmod +x "$sandbox/install.sh"
	: >"$sandbox/packages.lst"
	: >"$sandbox/aur-packages.lst"

	cat >"$sandbox/fakebin/pacman" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'FAKE %s %s\n' "$0" "$*" >>"$TEST_LOG"
if [[ "${1-}" == "-Qq" && "${2-}" == "base-devel" ]]; then
  if [[ "${FAKE_BASE_DEVEL_INSTALLED:-1}" == "1" ]]; then
    exit 0
  fi
  exit 1
fi
exit 0
EOF

	cat >"$sandbox/fakebin/sudo" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'FAKE %s %s\n' "$0" "$*" >>"$TEST_LOG"
exec "$@"
EOF

	cat >"$sandbox/fakebin/git" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'FAKE %s %s\n' "$0" "$*" >>"$TEST_LOG"
if [[ "${1-}" == "clone" ]]; then
  if [[ "${FAKE_GIT_CLONE_STATUS:-0}" != "0" ]]; then
    printf 'fake git clone failed with status %s\n' "$FAKE_GIT_CLONE_STATUS" >&2
    exit "$FAKE_GIT_CLONE_STATUS"
  fi
  mkdir -p "$3"
fi
EOF

	cat >"$sandbox/fakebin/makepkg" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'FAKE %s %s\n' "$0" "$*" >>"$TEST_LOG"
if [[ "${FAKE_MAKEPKG_STATUS:-0}" != "0" ]]; then
  printf 'fake makepkg failed with status %s\n' "$FAKE_MAKEPKG_STATUS" >&2
  exit "$FAKE_MAKEPKG_STATUS"
fi
if [[ "${FAKE_BOOTSTRAP_CREATES_PARU:-0}" == "1" ]]; then
  cat >"$FAKEBIN_DIR/paru" <<'PARU'
#!/usr/bin/env bash
set -euo pipefail
printf 'FAKE %s %s\n' "$0" "$*" >>"$TEST_LOG"
PARU
  chmod +x "$FAKEBIN_DIR/paru"
fi
EOF

	chmod +x "$sandbox/fakebin/pacman" "$sandbox/fakebin/sudo" "$sandbox/fakebin/git" "$sandbox/fakebin/makepkg"
	printf '%s\n' "$sandbox"
}

run_install() {
	local sandbox=$1
	TEST_LOG="$sandbox/commands.log" \
		FAKEBIN_DIR="$sandbox/fakebin" \
		PATH="$sandbox/fakebin" \
		bash "$sandbox/install.sh" >"$sandbox/stdout" 2>"$sandbox/stderr"
}

read_log() {
	local sandbox=$1
	if [[ -f "$sandbox/commands.log" ]]; then
		cat "$sandbox/commands.log"
	fi
}

test_existing_paru_installs_deduped_packages() {
	local sandbox
	sandbox=$(setup_sandbox)
	create_fake_paru "$sandbox/fakebin/paru"

	cat >"$sandbox/packages.lst" <<'EOF'
foo

# comment
bar
foo
EOF

	cat >"$sandbox/aur-packages.lst" <<'EOF'
baz
bar
# another comment
EOF

	run_install "$sandbox"
	local log
	log=$(read_log "$sandbox")

	assert_contains "$log" "FAKE $sandbox/fakebin/paru -S --needed bar baz foo" "existing paru should install deduped sorted packages"
	assert_not_contains "$log" "$sandbox/fakebin/git clone" "existing paru should skip paru bootstrap"
	assert_not_contains "$log" "$sandbox/fakebin/makepkg" "existing paru should skip makepkg"
}

test_missing_paru_clones_builds_then_installs() {
	local sandbox
	sandbox=$(setup_sandbox)

	cat >"$sandbox/packages.lst" <<'EOF'
alpha
EOF

	TEST_LOG="$sandbox/commands.log" \
		FAKEBIN_DIR="$sandbox/fakebin" \
		FAKE_BASE_DEVEL_INSTALLED=0 \
		FAKE_BOOTSTRAP_CREATES_PARU=1 \
		PATH="$sandbox/fakebin" \
		bash "$sandbox/install.sh" >"$sandbox/stdout" 2>"$sandbox/stderr"

	local log
	log=$(read_log "$sandbox")

	assert_contains "$log" "FAKE $sandbox/fakebin/sudo pacman -S --needed base-devel" "missing paru should install base-devel prerequisite"
	assert_contains "$log" "FAKE $sandbox/fakebin/git clone https://aur.archlinux.org/paru.git" "missing paru should clone paru"
	assert_contains "$log" "FAKE $sandbox/fakebin/makepkg -si --noconfirm" "missing paru should build paru"
	assert_contains "$log" "FAKE $sandbox/fakebin/paru -S --needed alpha" "missing paru should install requested packages"
	assert_order "$log" "$sandbox/fakebin/git clone https://aur.archlinux.org/paru.git" "$sandbox/fakebin/makepkg -si --noconfirm"
	assert_order "$log" "$sandbox/fakebin/makepkg -si --noconfirm" "$sandbox/fakebin/paru -S --needed alpha"
}

test_empty_lists_exit_without_bootstrap_or_install() {
	local sandbox
	sandbox=$(setup_sandbox)

	run_install "$sandbox"
	assert_file_empty "$sandbox/commands.log"
}

test_git_clone_failure_returns_clone_status() {
	local sandbox
	sandbox=$(setup_sandbox)

	cat >"$sandbox/packages.lst" <<'EOF'
alpha
EOF

	local status
	if TEST_LOG="$sandbox/commands.log" \
		FAKEBIN_DIR="$sandbox/fakebin" \
		FAKE_GIT_CLONE_STATUS=23 \
		PATH="$sandbox/fakebin" \
		bash "$sandbox/install.sh" >"$sandbox/stdout" 2>"$sandbox/stderr"; then
		fail "expected install to fail when git clone fails"
	else
		status=$?
	fi

	assert_equals "$status" "23" "git clone failure should preserve installer exit status"
	local stderr
	stderr=$(cat "$sandbox/stderr")
	assert_contains "$stderr" "git clone failed with status 23" "stderr should mention git clone failure status"
	assert_contains "$stderr" "fake git clone failed with status 23" "stderr should include clone command error"

	local log
	log=$(read_log "$sandbox")
	assert_not_contains "$log" "$sandbox/fakebin/makepkg" "git clone failure should skip makepkg"
	assert_not_contains "$log" "$sandbox/fakebin/paru -S --needed alpha" "git clone failure should skip package install"
}

test_makepkg_failure_returns_makepkg_status() {
	local sandbox
	sandbox=$(setup_sandbox)

	cat >"$sandbox/packages.lst" <<'EOF'
alpha
EOF

	local status
	if TEST_LOG="$sandbox/commands.log" \
		FAKEBIN_DIR="$sandbox/fakebin" \
		FAKE_MAKEPKG_STATUS=37 \
		PATH="$sandbox/fakebin" \
		bash "$sandbox/install.sh" >"$sandbox/stdout" 2>"$sandbox/stderr"; then
		fail "expected install to fail when makepkg fails"
	else
		status=$?
	fi

	assert_equals "$status" "37" "makepkg failure should preserve installer exit status"
	local stderr
	stderr=$(cat "$sandbox/stderr")
	assert_contains "$stderr" "makepkg failed with status 37" "stderr should mention makepkg failure status"
	assert_contains "$stderr" "fake makepkg failed with status 37" "stderr should include makepkg command error"

	local log
	log=$(read_log "$sandbox")
	assert_contains "$log" "FAKE $sandbox/fakebin/git clone https://aur.archlinux.org/paru.git" "makepkg failure should still clone paru"
	assert_not_contains "$log" "$sandbox/fakebin/paru -S --needed alpha" "makepkg failure should skip package install"
}

test_no_real_install_commands_during_tests() {
	local sandbox
	sandbox=$(setup_sandbox)
	create_fake_paru "$sandbox/fakebin/paru"

	cat >"$sandbox/packages.lst" <<'EOF'
solo
EOF

	run_install "$sandbox"
	local log
	log=$(read_log "$sandbox")

	assert_contains "$log" "FAKE $sandbox/fakebin/paru -S --needed solo" "test should use fake paru command"
	while IFS= read -r line; do
		[[ -z "$line" || "$line" == "FAKE $sandbox/fakebin/"* ]] || fail "expected fake command path, got [$line]"
	done <<<"$log"
}

run_test() {
	local name=$1
	TEST_COUNT=$((TEST_COUNT + 1))
	"$name"
	printf 'ok %d - %s\n' "$TEST_COUNT" "$name"
}

run_test test_existing_paru_installs_deduped_packages
run_test test_missing_paru_clones_builds_then_installs
run_test test_empty_lists_exit_without_bootstrap_or_install
run_test test_git_clone_failure_returns_clone_status
run_test test_makepkg_failure_returns_makepkg_status
run_test test_no_real_install_commands_during_tests

printf '1..%d\n' "$TEST_COUNT"
