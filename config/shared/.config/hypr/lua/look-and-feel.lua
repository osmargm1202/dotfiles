hl.config({
  general = {
    gaps_in = 12,
    gaps_out = 12,
    border_size = 3,
    col = {
      active_border = { colors = { "rgba(8aadf4ee)", "rgba(f5a97fee)" }, angle = 45 },
      inactive_border = "rgba(363a4faa)",
    },
    resize_on_border = false,
    allow_tearing = false,
    layout = "dwindle",
  },

  group = {
    col = {
      border_active = { colors = { "rgba(ff3355ee)", "rgba(b455ffee)" }, angle = 45 },
      border_inactive = { colors = { "rgba(80305099)", "rgba(5a3d8a99)" }, angle = 45 },
      border_locked_active = { colors = { "rgba(ff6b35ee)", "rgba(b455ffee)" }, angle = 45 },
      border_locked_inactive = { colors = { "rgba(5a223899)", "rgba(3f2a6099)" }, angle = 45 },
    },
    groupbar = {
      font_size = 24,
      height = 42,
      gradients = true,
      col = {
        active = "rgba(8aadf4ee)",
        inactive = "rgba(00161acc)",
        locked_active = "rgba(f5a97fee)",
        locked_inactive = "rgba(00161acc)",
      },
    },
  },

  decoration = {
    rounding = 12,
    rounding_power = 2,
    active_opacity = 0.96,
    inactive_opacity = 0.96,
    fullscreen_opacity = 1.0,
    shadow = {
      enabled = true,
      range = 18,
      render_power = 3,
      color = "rgba(00000070)",
    },
    blur = {
      enabled = true,
      size = 5,
      passes = 3,
      vibrancy = 0.17,
    },
  },

  animations = {
    enabled = true,
  },
})

hl.layer_rule({
  name = "blur-waybar",
  match = { namespace = "waybar" },
  blur = true,
  ignore_alpha = 0.10,
})

hl.curve("easeOutQuint", { type = "bezier", points = { { 0.23, 1 }, { 0.32, 1 } } })
hl.curve("almostLinear", { type = "bezier", points = { { 0.5, 0.5 }, { 0.75, 1 } } })
hl.curve("quick", { type = "bezier", points = { { 0.15, 0 }, { 0.1, 1 } } })

hl.animation({ leaf = "global", enabled = true, speed = 10, bezier = "default" })
hl.animation({ leaf = "border", enabled = true, speed = 5.39, bezier = "easeOutQuint" })
hl.animation({ leaf = "windows", enabled = true, speed = 4.79, bezier = "easeOutQuint" })
hl.animation({ leaf = "windowsIn", enabled = true, speed = 4.1, bezier = "easeOutQuint", style = "popin 87%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 1.49, bezier = "almostLinear", style = "popin 87%" })
hl.animation({ leaf = "fade", enabled = true, speed = 3.03, bezier = "quick" })
hl.animation({ leaf = "layers", enabled = true, speed = 3.81, bezier = "easeOutQuint" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 1.94, bezier = "almostLinear", style = "fade" })
