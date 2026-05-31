function unbindheadset
    set -l sudo_cmd sudo
    if test -x /run/wrappers/bin/sudo
        set sudo_cmd /run/wrappers/bin/sudo
    end

    printf '1-11.1\n' | $sudo_cmd tee /sys/bus/usb/drivers/usb/unbind > /dev/null
    sleep 2
    printf '1-11.1\n' | $sudo_cmd tee /sys/bus/usb/drivers/usb/bind > /dev/null
end
