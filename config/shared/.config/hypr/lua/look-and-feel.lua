hl.config({
  general = {
    gaps_in = 12,
    gaps_out = 12,
    border_size = 2,
    col = {
      active_border = { colors = { "rgba(8aadf4ee)", "rgba(f5a97fee)" }, angle = 45 },
      inactive_border = "rgba(363a4faa)",
    },
    resize_on_border = false,
    allow_tearing = false,
    layout = "dwindle",
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
