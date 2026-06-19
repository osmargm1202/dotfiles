# Task 2 Report: Regroup custom buttons with gaps and apply

Status: **DONE**

## Files Changed

| File | Change |
|------|--------|
| `config/shared/.config/waybar/config` | top bar: removed custom buttons from top-right (wallpaper, usb_devices, memclean, nixclean); bottom bar: added them + their module definitions |
| `config/shared/.config/waybar-hypr/config` | top bar: removed 8 custom buttons → only privacy/tray/clipboard/theme_toggle/logout_menu; bottom bar: added them as first group before conky_toggle + their module definitions |
| `config/shared/.config/waybar/style.css` | `#custom-logout_menu` got `font-weight: bold`; added group gap rule `margin-left: 16px` for memclean/hardware_fetch/conky_toggle |
| `config/shared/.config/waybar-hypr/style.css` | Removed `#custom-logout_menu` from SVG icon group; added `#custom-logout_menu { color: @red; font-weight: bold; }`; added group gap rule |

## Module Reordering

### Sway top → bottom
- **Removed from top**: custom/wallpaper, custom/usb_devices, custom/memclean, custom/nixclean
- **Added to bottom**: same modules (with definitions copied), after group/usage, before kbd_layout

### Hypr top → bottom
- **Removed from top**: custom/wallpaper, custom/usb_devices, custom/headset_reconnect, custom/memclean, custom/nixclean, custom/hardware_fetch, custom/pi_status, custom/hypr_config_editor
- **Added to bottom**: all 8 modules + definitions, before conky_toggle

## CSS Changes

- `#custom-logout_menu { color: @red; font-weight: bold; }` in both CSS files
- `#custom-memclean, #custom-hardware_fetch, #custom-conky_toggle { margin-left: 16px; }` in both CSS files

## Validation

All structural checks pass. JSON configs parse correctly. CSS rules present.

## Commit

`3d66679` feat(waybar): regroup custom buttons with gaps, power red

## Apply

Synced to host via `hypr-orgm-dot sync` for all 4 files.
