-- Host-specific monitor layout for orgm.
-- HDMI-A-1 is the right-side vertical display, rotated 90° clockwise.
hl.monitor({ output = "DP-3",     mode = "2560x1440@164.96", position = "0x0",   scale = 1.15, transform = 0 })
hl.monitor({ output = "HDMI-A-1", mode = "1920x1080@119.98", position = "auto",  scale = 1,    transform = 1 })
