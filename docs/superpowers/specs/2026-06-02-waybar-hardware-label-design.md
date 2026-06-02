# Waybar Hardware Label Design

Add a movable Waybar hardware block that shows machine model or motherboard, CPU, and GPU summary near the bottom-right system usage area.

## Goals

1. Show a short hardware identity label in Waybar.
2. Prefer a real laptop/desktop model when available.
3. Fall back to motherboard name when product model is generic or not useful.
4. Show CPU and all detected GPUs, including hybrid Intel/NVIDIA laptop graphics.
5. Keep the block independent so it can move to another Waybar position later.
6. Open `fastfetch` in Kitty on click.

## Recommended Approach

Use a shared shell helper script and a dedicated Waybar custom module group.

Files:

- `config/shared/.local/bin/waybar-hardware-label`
- `config/shared/.config/waybar-hypr/config`
- `config/dotfiles.json`

The helper runs from Waybar, reads host hardware data, formats one short line, and prints JSON for Waybar. The Waybar config adds `group/hardware` to `bottom_bar.modules-right` before `group/usage`.

## Display Format

Main text:

```text
<model-or-board> - <cpu-short> - <gpu-short[/gpu-short...]>
```

Examples:

```text
ThinkPad E14 - i5-1235U - Iris Xe/RTX 3050
PRO B660M-A WIFI DDR4 - i5-12400F - RTX 3060
MSI B450 - Ryzen 5 5600X - RTX 3060
```

Tooltip should include fuller raw names when useful, for example:

```text
Modelo: ThinkPad E14 Gen 4
CPU: 12th Gen Intel(R) Core(TM) i5-1235U
GPU: Intel Iris Xe Graphics / NVIDIA GeForce RTX 3050 Laptop GPU
Click: fastfetch
```

## Detection Rules

### Model / motherboard

1. Read DMI from `/sys/class/dmi/id`.
2. Ignore generic values such as `System Product Name`, `To Be Filled By O.E.M.`, `Default string`, `None`, empty values, and bare board codes when a better board name exists.
3. On laptops, prefer useful `product_name`.
4. On desktops, prefer useful `board_name` when `product_name` is generic or code-like.
5. Final fallback is `product_name`, then `board_name`, then hostname.

### CPU

Read the first CPU model from `/proc/cpuinfo`, then shorten common vendor noise:

- `12th Gen Intel(R) Core(TM) i5-12400F` → `i5-12400F`
- `AMD Ryzen 5 5600X 6-Core Processor` → `Ryzen 5 5600X`

Keep raw CPU name in tooltip.

### GPU

Detect GPUs from available host tools and kernel data:

1. Prefer `nvidia-smi --query-gpu=name --format=csv,noheader` for NVIDIA names when present.
2. Use `/sys/class/drm/card*/device/uevent` and vendor IDs to detect Intel/AMD/NVIDIA GPUs even when `lspci` is unavailable.
3. Use `lspci` if present to get better names for non-NVIDIA GPUs.
4. Deduplicate names.
5. Join multiple GPUs with `/`.

If detailed names are unavailable, use vendor fallback names such as `Intel GPU`, `AMD GPU`, or `NVIDIA GPU`.

## Waybar Integration

Add an independent group:

```json
"group/hardware": {
  "orientation": "horizontal",
  "modules": ["custom/hardware_label"]
}
```

Add the group before `group/usage` in `bottom_bar.modules-right`:

```json
"modules-right": [
  "group/hardware",
  "group/usage",
  "custom/kbd_layout",
  "custom/keybindings_help"
]
```

Add the custom module:

```json
"custom/hardware_label": {
  "exec": "waybar-hardware-label",
  "return-type": "json",
  "interval": 3600,
  "format": "{}",
  "tooltip": true,
  "on-click": "kitty -e fastfetch"
}
```

A one-hour interval is enough because hardware identity does not change during a session. Manual Waybar reload updates it after config/script changes.

## Error Handling

The helper must never break Waybar. If any hardware source is missing, it should still return valid JSON with the best available fallback.

Fallback examples:

```text
orgm - i5-12400F - RTX 3060
orgm - CPU - GPU
```

If JSON escaping is needed, use Python or careful shell escaping so model names with quotes do not break Waybar.

## Testing

Manual checks:

1. Run `waybar-hardware-label` and verify valid JSON.
2. Verify it shows current `orgm` host as motherboard + CPU + GPU.
3. Validate Waybar config still parses.
4. Sync dotfiles with `distrobox-host-exec orgm-dot diff` then `distrobox-host-exec orgm-dot sync`.
5. Reload Waybar and confirm the new group appears bottom-right before CPU.
6. Click the label and confirm Kitty opens `fastfetch`.

## Out of Scope

- Live GPU usage metrics.
- Per-host hand-written labels unless later needed.
- Replacing existing CPU, memory, temperature, disk, or swap modules.
- Styling redesign beyond reusing current Waybar group/module style.
