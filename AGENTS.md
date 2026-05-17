# Dotfiles agent instructions

## dot.sh workflow

Use `./dot.sh` from this repository (or `dot` after `./dot.sh install`) to compare and apply managed dotfiles.

Preferred commands use the fast subcommand form, without `--` on the command:

```bash
./dot.sh status --host orgm
./dot.sh diff --host orgm
./dot.sh sync --host orgm
./dot.sh daemon --host orgm
./dot.sh add ~/.config/example --host orgm
./dot.sh add ~/.config/example --shared
./dot.sh remove ~/.config/example --host orgm
```

Legacy command flags like `--diff` and `--sync` may still work, but do not use them in new notes or examples.

## Change procedure

1. Edit the tracked source under `config/shared` or `config/hosts/<host>`.
2. If the file is new, add the path to `config/dotfiles.json` under `shared.paths` or `hosts.<host>.paths`.
3. Check what will change:

   ```bash
   ./dot.sh diff --host orgm
   ```

4. Apply the configuration to the destination home:

   ```bash
   ./dot.sh sync --host orgm
   ```

5. Verify the application or config that changed.

## Scope notes

- `config/shared` is for files shared by all hosts.
- `config/hosts/orgm` and other host directories are for host-specific files.
- `local_only.paths` in `config/dotfiles.json` protects local secrets/state from being synced.
- For desktop launchers, prefer storing them under `config/shared/.local/share/applications` unless they are host-specific.
