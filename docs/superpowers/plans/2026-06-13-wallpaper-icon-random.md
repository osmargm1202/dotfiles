# Wallpaper Icon Random Click Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Waybar-Hypr wallpaper icon choose a random wallpaper for all Hyprland screens on left click.

**Architecture:** Reuse the existing `hypr-random-wallpaper next` helper rather than adding a new wrapper. Update the Waybar `custom/wallpaper` command and tooltip, then add a focused shell test assertion so the click behavior cannot regress back to opening the picker.

**Tech Stack:** Waybar JSONC-style config, Bash helper tests, existing dotfiles `orgm-dot` workflow.

---

## File structure

- Modify: `config/shared/.config/waybar-hypr/config`
  - Owns Waybar-Hypr module configuration.
  - Change only `custom/wallpaper` left-click command and tooltip.
- Modify: `tests/helpers/waybar-hypr-custom-icons.bats.sh`
  - Existing Waybar-Hypr smoke test.
  - Add assertions for wallpaper click command and tooltip text.
- Read-only verification: `config/shared/.local/bin/hypr-random-wallpaper`
  - Existing command used by Waybar. Do not modify in this plan.

---

### Task 1: Test and implement Waybar wallpaper random click

**Files:**
- Modify: `tests/helpers/waybar-hypr-custom-icons.bats.sh`
- Modify: `config/shared/.config/waybar-hypr/config`

- [ ] **Step 1: Write the failing test**

Edit `tests/helpers/waybar-hypr-custom-icons.bats.sh`. After this existing block:

```bash
grep -q 'margin-left": 12' "$root/config/shared/.config/waybar-hypr/config" || fail "Waybar should keep Hyprland-like side gap"
grep -q 'margin-right": 12' "$root/config/shared/.config/waybar-hypr/config" || fail "Waybar should keep Hyprland-like side gap"
```

Add these assertions:

```bash
grep -q '"on-click": "hypr-random-wallpaper next"' "$root/config/shared/.config/waybar-hypr/config" || fail "wallpaper icon left click should choose a random wallpaper"
grep -q '"tooltip-format": "Wallpaper aleatorio"' "$root/config/shared/.config/waybar-hypr/config" || fail "wallpaper icon tooltip should describe random behavior"
if grep -q '"on-click": "orgm-wallpaper pick"' "$root/config/shared/.config/waybar-hypr/config"; then
  fail "wallpaper icon left click should not open picker"
fi
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bash tests/helpers/waybar-hypr-custom-icons.bats.sh
```

Expected result before implementation:

```text
FAIL: wallpaper icon left click should choose a random wallpaper
```

- [ ] **Step 3: Write minimal implementation**

Edit `config/shared/.config/waybar-hypr/config`. Change only the `custom/wallpaper` block from:

```json
    "custom/wallpaper": {
      "format": "",
      "tooltip": true,
      "tooltip-format": "Elegir wallpaper",
      "on-click": "orgm-wallpaper pick"
    },
```

to:

```json
    "custom/wallpaper": {
      "format": "",
      "tooltip": true,
      "tooltip-format": "Wallpaper aleatorio",
      "on-click": "hypr-random-wallpaper next"
    },
```

- [ ] **Step 4: Run focused tests to verify pass**

Run:

```bash
bash tests/helpers/waybar-hypr-custom-icons.bats.sh
bash tests/helpers/hypr-random-wallpaper.bats.sh
```

Expected result:

```text
PASS: Waybar-Hypr custom icons configured
hypr random wallpaper smoke test passed
```

- [ ] **Step 5: Review dotfiles diff**

Run:

```bash
distrobox-host-exec orgm-dot diff
```

Expected: diff shows the Waybar-Hypr config click command and tooltip changing. If it shows unrelated files, stop and inspect before syncing.

- [ ] **Step 6: Apply dotfiles**

Run:

```bash
distrobox-host-exec orgm-dot sync
```

Expected: sync completes without errors.

- [ ] **Step 7: Commit implementation**

Run:

```bash
git status --short
git add config/shared/.config/waybar-hypr/config tests/helpers/waybar-hypr-custom-icons.bats.sh
git commit -m "feat(hypr): randomize wallpaper from Waybar icon"
```

Expected: commit includes only the Waybar config and test change.
