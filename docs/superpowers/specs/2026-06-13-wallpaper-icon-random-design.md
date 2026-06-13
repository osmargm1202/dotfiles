# Wallpaper icon random click design

Date: 2026-06-13

## Goal

Clicking the Waybar wallpaper icon should immediately select a random wallpaper and apply it to all Hyprland screens.

## Current state

- Waybar-Hypr defines `custom/wallpaper` in `config/shared/.config/waybar-hypr/config`.
- The current left click runs `orgm-wallpaper pick`, which opens the picker instead of changing wallpaper immediately.
- `config/shared/.local/bin/hypr-random-wallpaper` already supports `next` and applies the selected image through Hyprland/hyprpaper using the global monitor target.
- `tests/helpers/hypr-random-wallpaper.bats.sh` already smoke-tests `hypr-random-wallpaper next` behavior.

## Chosen approach

Use the existing `hypr-random-wallpaper next` command directly from Waybar.

Waybar `custom/wallpaper` changes:

- `on-click`: `hypr-random-wallpaper next`
- `tooltip-format`: `Wallpaper aleatorio`

No new wrapper is needed. No changes to the wallpaper daemon, picker app, or keybindings are included.

## Alternatives considered

1. Use an `orgm-wallpaper` random command if available. This may be more integrated with newer wallpaper backend code, but the exact command surface is outside this dotfiles change and needs extra NixOS repo verification.
2. Create a new wrapper for Waybar click behavior. This adds indirection without current need.

## Testing

Add a focused helper test assertion that `custom/wallpaper` uses `hypr-random-wallpaper next` for left click and no longer opens the picker on left click.

Run:

```bash
bash tests/helpers/waybar-hypr-custom-icons.bats.sh
bash tests/helpers/hypr-random-wallpaper.bats.sh
```

Then inspect and apply dotfiles with:

```bash
distrobox-host-exec orgm-dot diff
distrobox-host-exec orgm-dot sync
```

## Acceptance criteria

- Clicking the wallpaper icon in Waybar-Hypr changes to a random wallpaper.
- The random wallpaper applies to all Hyprland screens through existing `hypr-random-wallpaper next` behavior.
- Waybar config test covers the click command.
- Dotfiles diff is reviewed and synced.
