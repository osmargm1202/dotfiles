# Dotfiles agent instructions

## orgm-dot workflow

Use `orgm-dot` to compare and apply managed dotfiles.

Preferred commands use the fast subcommand form, without `--` on the command:

```bash
orgm-dot status --host orgm
orgm-dot diff --host orgm
orgm-dot sync --host orgm
orgm-dot daemon --host orgm
orgm-dot add ~/.config/example --host orgm
orgm-dot add ~/.config/example --shared
orgm-dot remove ~/.config/example --host orgm
```

Legacy command flags like `--diff` and `--sync` may still work, but do not use them in new notes or examples.

## Change procedure

1. Edit the tracked source under `config/shared` or `config/hosts/<host>`.
2. If the file is new, add the path to `config/dotfiles.json` under `shared.paths` or `hosts.<host>.paths`.
3. Check what will change:

   ```bash
   orgm-dot diff --host orgm
   ```

4. Apply the configuration to the destination home:

   ```bash
   orgm-dot sync --host orgm
   ```

5. Verify the application or config that changed.

## Scope notes

- `config/shared` is for files shared by all hosts.
- `config/hosts/orgm` and other host directories are for host-specific files.
- `local_only.paths` in `config/dotfiles.json` protects local secrets/state from being synced.
- For desktop launchers, prefer storing them under `config/shared/.local/share/applications` unless they are host-specific.
