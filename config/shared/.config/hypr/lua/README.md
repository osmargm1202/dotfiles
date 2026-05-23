# Hyprland Lua foundation

This directory contains the canonical Hyprland 0.55 Lua configuration modules.
Legacy split hyprlang `.conf` fallback files have been removed; keep Hyprland
behavior changes in these Lua modules.

## Entrypoint order

`../hyprland.lua` loads modules in this order:

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
