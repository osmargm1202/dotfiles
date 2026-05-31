-- Host-specific monitor layout for orgm.
-- DP-3: primary.
-- HDMI-A-1: right-side vertical panel.
-- Both displays use scale 1 for homogeneous pointer and UI sizing.
-- HDMI-A-1 rotated logical size is 1080x1920; y=-240 aligns it with DP-3 vertical center.
hl.monitor({ output = "DP-3",     mode = "2560x1440@164.96", position = "0x0", scale = 1, transform = 0 })
hl.monitor({ output = "HDMI-A-1", mode = "1920x1080@119.98", position = "2560x-240", scale = 1, transform = 1 })
