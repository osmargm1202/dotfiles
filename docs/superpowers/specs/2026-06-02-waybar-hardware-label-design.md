# Waybar Hardware Fastfetch Button Design

Add a simple Waybar button that opens a detailed Fastfetch hardware view in Kitty. This replaces the earlier idea of printing model/CPU/GPU directly inside Waybar.

## Goals

1. Keep Waybar clean: show only one hardware/info button.
2. Put the button in an independent group so it can move later.
3. Place it initially bottom-right before the existing CPU/memory usage group.
4. On click, open Kitty and run Fastfetch with a dedicated detailed hardware config.
5. Keep the existing normal Fastfetch config unchanged.
6. Avoid custom hardware parsing scripts, menus, or special detector logic in Waybar.

## Approach

Use Waybar only as a launcher. Fastfetch already knows how to show host, board, CPU, GPU, memory, disks, OS, kernel, session, WM, display, and packages. A dedicated config can be detailed without forcing a long label into the panel.

Files:

- `config/shared/.config/waybar-hypr/config`
- `config/shared/.config/fastfetch/hardware.jsonc`

The existing `.config/fastfetch` directory is already tracked in `config/dotfiles.json`, so no manifest path is needed for the new config file.

## Waybar Integration

Add a standalone group to `bottom_bar.modules-right`, before `group/usage`:

```json
"modules-right": [
  "group/hardware",
  "group/usage",
  "custom/kbd_layout",
  "custom/keybindings_help"
]
```

Define the group:

```json
"group/hardware": {
  "orientation": "horizontal",
  "modules": [
    "custom/hardware_fetch"
  ]
}
```

Define the button:

```json
"custom/hardware_fetch": {
  "format": "󰌢",
  "tooltip": true,
  "tooltip-format": "Hardware / Fastfetch",
  "on-click": "kitty --title hardware-fastfetch -e sh -lc 'fastfetch --config ~/.config/fastfetch/hardware.jsonc; printf \"\\nEnter para cerrar...\"; read -r _'"
}
```

## Fastfetch Hardware Config

Create `config/shared/.config/fastfetch/hardware.jsonc` as a second config. It should be more complete than the daily Fastfetch view.

Recommended sections:

- Hardware: Host, Board, Chassis, BIOS, CPU, CPU cache, GPU, physical memory.
- System: OS, Kernel, Init, Packages, Shell, WM, DE, Terminal.
- Display and storage: Display, Disk, PhysicalDisk, Memory, Swap.
- Session: Uptime, Locale, Battery when present, colors.

The config should not force an ORGM image logo. It should let Fastfetch choose the system logo automatically, so the host shows the NixOS/System logo.

## Behavior

- Waybar shows one compact hardware icon.
- Click opens a normal Kitty terminal titled `hardware-fastfetch`, keeps normal Kitty styling/opactity, and waits with `Enter para cerrar...` after Fastfetch exits.
- Hyprland floats and centers that terminal by matching its title, not by changing Kitty class.
- Hardware details come from Fastfetch modules, including laptops with integrated/dedicated GPUs where Fastfetch detects both.
- No custom menu or separate detector script is required.

## Testing

1. Validate Waybar config structure with Python after stripping `//` comments.
2. Run `fastfetch --config config/shared/.config/fastfetch/hardware.jsonc` in the repo/container to catch syntax errors.
3. Run host Fastfetch through `distrobox-host-exec` after sync.
4. Use `distrobox-host-exec orgm-dot diff` and `sync`.
5. Reload Waybar.
6. Click button and confirm Kitty opens detailed Fastfetch and waits for Enter.

## Out of Scope

- Showing model/CPU/GPU text directly in Waybar.
- Custom parsing of DMI, CPU, or GPU names.
- Menus or rofi/quick-shell UI for hardware details.
- Changing the default `config/shared/.config/fastfetch/config.jsonc` view.
