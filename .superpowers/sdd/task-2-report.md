# Task 2 Report: compact translucent styling

## Scope
- Modified `config/shared/.config/waybar/style.css`
- Modified `config/shared/.config/waybar-hypr/style.css`
- Kept existing `@import "orgm-current.css"` in both files
- Did not touch theme-toggle logic

## Design used
- Minimal CSS-only delta
- Converted top/bottom bar containers to black translucent shells with `background: rgba(0, 0, 0, 0.6);`, `border: none;`, `border-radius: 0;`, `box-shadow: none;`
- Applied same shell treatment to `window.dock_bar#waybar` in both files for consistent bar container styling
- Reduced vertical spacing values so shorter bars keep breathing room without clipping
- Set `#custom-time` to `font-size: 24px;` with tighter padding/margins in both files
- Added invisible `window.dock_spacer#waybar` styling in Hyprland CSS

## RED check run
Command:
```bash
python - <<'PY'
from pathlib import Path
checks = {
    'config/shared/.config/waybar/style.css': [
        'window.top_bar#waybar,',
        'background: rgba(0, 0, 0, 0.6);',
        'border-radius: 0;',
        'box-shadow: none;',
        'font-size: 24px;',
    ],
    'config/shared/.config/waybar-hypr/style.css': [
        'window.top_bar#waybar,',
        'background: rgba(0, 0, 0, 0.6);',
        'border-radius: 0;',
        'box-shadow: none;',
        'font-size: 24px;',
        'window.dock_spacer#waybar',
    ],
}
missing = []
for path, needles in checks.items():
    text = Path(path).read_text()
    for needle in needles:
        if needle not in text:
            missing.append(f'{path} missing {needle}')
if not missing:
    raise SystemExit('unexpected pass: css already matches target')
print('\n'.join(missing))
PY
```

Result:
- Failed as expected before edits
- Missing target background/radius/time-size/spacer rules

## GREEN checks run
Command:
```bash
python - <<'PY'
from pathlib import Path
for path in [
    'config/shared/.config/waybar/style.css',
    'config/shared/.config/waybar-hypr/style.css',
]:
    text = Path(path).read_text()
    assert 'background: rgba(0, 0, 0, 0.6);' in text, path
    assert 'border-radius: 0;' in text, path
    assert 'box-shadow: none;' in text, path
    assert 'font-size: 24px;' in text, path
assert 'window.dock_spacer#waybar' in Path('config/shared/.config/waybar-hypr/style.css').read_text()
print('css ok')
PY
```
Result:
- `css ok`

Additional compact-spacing check:
```bash
python - <<'PY'
from pathlib import Path
shared = Path('config/shared/.config/waybar/style.css').read_text()
hypr = Path('config/shared/.config/waybar-hypr/style.css').read_text()
assert 'min-height: 32px;' in shared
assert 'margin-top: 4px;' in shared and 'margin-bottom: 4px;' in shared
assert 'margin: 4px 0;' in shared
assert 'min-height: 28px;' in shared
assert 'min-height: 32px;' in hypr
assert 'padding: 4px 10px;' in hypr
assert 'margin: 4px 1px;' in hypr
assert 'padding: 3px 7px;' in hypr
assert 'min-width: 88px;' in hypr
print('compact spacing ok')
PY
```
Result:
- `compact spacing ok`

## Dotfiles verification
Attempted:
```bash
distrobox-host-exec orgm-dot diff
```
Result:
- Failed with exit code `127`
- Root cause investigation showed host environment does not currently provide `orgm-dot`

Fallback checks:
- `git diff -- config/shared/.config/waybar/style.css config/shared/.config/waybar-hypr/style.css`
- `git status --short`

## Concerns
- Could not run `orgm-dot diff` or `orgm-diff`/`orgm-sync` because those host commands are unavailable in this environment right now
- CSS structural checks passed, but host-side managed-dotfiles preview/apply remains unverified

## Review fix follow-up
- Reverted unintended `window.dock_bar#waybar` hardcoded translucent restyle in both CSS files
- Restored shared dock bar shell to theme-driven `background-color: @panel_bg; border: none; border-radius: 12px;`
- Restored Hyprland dock bar shell to theme-driven `background-color: @panel_bg; border: none; border-radius: 12px;` plus `border: 2px solid @panel_border;`
- Kept required top/bottom translucent bar changes, compact spacing, both `#custom-time` blocks at `font-size: 24px;`, Hyprland `window.dock_spacer#waybar` invisibility, and existing theme-toggle rule untouched

### Focused verification after review fix
Command:
```bash
python - <<'PY'
from pathlib import Path
shared = Path('config/shared/.config/waybar/style.css').read_text()
hypr = Path('config/shared/.config/waybar-hypr/style.css').read_text()
assert 'window.top_bar#waybar,\nwindow.bottom_bar#waybar {\n  background: rgba(0, 0, 0, 0.6);\n  border: none;\n  border-radius: 0;\n  box-shadow: none;\n}' in shared
assert 'window.top_bar#waybar,\nwindow.bottom_bar#waybar {\n  background: rgba(0, 0, 0, 0.6);\n  border: none;\n  border-radius: 0;\n  box-shadow: none;\n}' in hypr
assert '#custom-time {\n  background: transparent;\n  border-radius: 12px;\n  color: @text;\n  font-size: 24px;' in shared
assert '#custom-time {\n  background: transparent;\n  border-radius: 12px;\n  color: @text;\n  font-size: 24px;' in hypr
assert 'window.dock_bar#waybar {\n  background-color: @panel_bg;\n  border: none;\n  border-radius: 12px;\n}' in shared
assert 'window.dock_bar#waybar {\n  background-color: @panel_bg;\n  border: none;\n  border-radius: 12px;\n}' in hypr
assert 'window.dock_spacer#waybar,\nwindow.dock_spacer#waybar * {' in hypr
assert 'window.dock_bar#waybar {\n  border: 2px solid @panel_border;\n}' in hypr
assert '#custom-theme_toggle { background-image: url("icons/theme_toggle.svg"); }' in hypr
print('task-2 fix checks ok')
PY
```
Result:
- `task-2 fix checks ok`

Additional diff review:
```bash
git diff -- config/shared/.config/waybar/style.css config/shared/.config/waybar-hypr/style.css
```
Result:
- Diff limited to reverting unintended `window.dock_bar#waybar` visual changes while preserving requested Task 2 edits
