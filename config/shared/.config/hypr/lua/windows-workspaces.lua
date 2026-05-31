-- Hyprland 0.55 Lua window rules.

local opacity_rules = {
  { class = ".*", opacity = "0.96 override 0.96 override 1.0 override" },
  -- Nautilus/Files uses an opaque GTK4/libadwaita surface; make it visibly translucent
  -- so Hyprland blur is noticeable behind the window.
  { class = "^(org.gnome.Nautilus)$", opacity = "0.88 override 0.88 override 1.0 override" },
  { class = "^(kitty)$", opacity = "0.85 override 0.85 override 1.0 override" },
  { class = "^(app.zen_browser.zen)$", opacity = "0.90 override 0.90 override 1.0 override" },
  { class = "^(zen-browser)$", opacity = "0.90 override 0.90 override 1.0 override" },
  { class = "^(chromium)$", opacity = "0.90 override 0.90 override 1.0 override" },
  { class = "^(Chromium)$", opacity = "0.90 override 0.90 override 1.0 override" },
}

for _, rule in ipairs(opacity_rules) do
  hl.window_rule({
    match = { class = rule.class },
    opacity = rule.opacity,
  })
end

local utilities = {
  { class = "^(org.gnome.Calculator)$", size = "420 520" },
  { class = "^(pavucontrol)$", size = "760 520" },
  { class = "^(blueman-manager)$", size = "760 520" },
  { class = "^(nm-connection-editor)$", size = "820 560" },
  { class = "^(nwg-displays)$", size = "980 640" },
  { class = "^(org.gnome.FileRoller)$", size = "820 560" },
}

for _, rule in ipairs(utilities) do
  hl.window_rule({ match = { class = rule.class }, float = true })
  hl.window_rule({ match = { class = rule.class }, size = rule.size })
  hl.window_rule({ match = { class = rule.class }, center = true })
end

hl.window_rule({ match = { modal = true }, float = true })

-- Discord starts normally; no forced scratchpad.

hl.window_rule({
  name = "fix-xwayland-empty-class-drags",
  match = {
    class = "^$",
    title = "^$",
    xwayland = true,
    float = true,
    fullscreen = false,
    pin = false,
  },
  no_focus = true,
})
