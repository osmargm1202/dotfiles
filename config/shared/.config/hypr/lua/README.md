# Hyprland Lua foundation

This directory contains additive Hyprland 0.55 Lua modules. Legacy hyprlang split
files remain the rollback/fallback path until runtime parity is proven.

## Entrypoint order

`../hyprland.lua` currently loads modules in this order:

1. `lua.monitors`
2. `lua.programs`
3. `lua.autostart`
4. `lua.environment`
5. `lua.permissions`
6. `lua.look-and-feel`
7. `lua.layout`
8. `lua.input`
9. `lua.keybindings` with the `programs` table
10. `lua.windows-workspaces`

Keep this order deterministic. Put shared external command names in
`programs.lua`; pass them into modules instead of duplicating paths.

## Module contract

- Lua modules must be fast to load and safe during compositor startup/reload.
- Long-running or interactive work should call `orgm-hypr` subcommands when
  command parity exists; compatibility wrappers remain only for external users.
- Repo-owned Hyprland callers should prefer canonical `orgm-hypr <function>`
  or `orgm-hypr <function> <subfunction>` command names.
- Do not delete wrappers unless caller audit proves no compatibility need.

## Hyprlang fallback order

`../hyprland.conf` remains the fallback source chain:

1. `00-monitors.conf`
2. `10-programs.conf`
3. `20-autostart.conf`
4. `30-environment.conf`
5. `40-permissions.conf`
6. `50-look-and-feel.conf`
7. `55-layout.conf`
8. `60-input.conf`
9. `70-keybindings.conf`
10. `80-windows-workspaces.conf`
11. `90-noctalia-colors.conf`

Rollback for Lua foundation: disable or revert `hyprland.lua`/Lua additions and
keep `hyprland.conf` plus split conf files unchanged.
