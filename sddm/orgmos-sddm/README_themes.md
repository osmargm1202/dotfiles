# SDDM ORGMOS Theme - Color Variations

## Available Themes

### 1. Default (theme.conf.user) 🌌
- Original ORGMOS theme with sky blue accents
- Background: `#0a1929` (dark navy)
- Accent: `#87ceeb` (sky blue)

### 2. Tokyo Night (tokyo-night.conf) ⭐
- Dark theme inspired by Tokyo Night VSCode theme
- Background: `#1a1b26` (dark blue-black)
- Accent: `#7dcfff` (bright cyan/sky blue) - **Bright sky blue button**

### 3. Panther (panther.conf) 🐾
- Dark minimal theme
- Background: `#111111` (nearly black)
- Accent: varies

### 4. Lynx (lynx.conf) 🦁
- Light theme
- Background: `#F9F9F9` (off-white)
- Accent: varies
- Uses special lynx variants of icons

## Usage

### After Installing SDDM Theme

To change the active theme:

```bash
cd /home/osmar/Myconfig/sddm/orgmos-sddm
./change-theme.sh
```

Select from available themes using the interactive menu.

### Manual Method

```bash
# Copy desired theme to theme.conf
sudo cp tokyo-night.conf /usr/share/sddm/themes/orgmos-sddm/theme.conf

# Restart SDDM
sudo systemctl restart sddm
```

## Installation

The themes are installed via:
```bash
sudo ./Apps/install_sddm.sh
```

The installer copies all theme files but doesn't automatically set one as default. You need to run `change-theme.sh` to select your preferred theme.

## Theme Structure

Each `.conf` file contains:
- `backgroundColor`: Main background
- `boxColor`: Login box background
- `borderColor`: Border colors
- `buttonColor`: Button backgrounds
- `textColor`: Main text
- `secondaryTextColor`: Secondary text
- `accentColor`: **Login button color** ⭐
- `onAccentColor`: Text on login button
- `dangerColor`: Error messages

## Recommended: Tokyo Night ⭐

Tokyo Night offers the best balance of:
- Dark, comfortable background
- Bright sky blue login button (`#7dcfff`)
- Excellent contrast for readability
- Modern aesthetic

