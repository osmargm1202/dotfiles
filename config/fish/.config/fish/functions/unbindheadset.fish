function unbindheadset
    printf '1-11.1\n' | sudo tee /sys/bus/usb/drivers/usb/unbind > /dev/null
    sleep 2
    printf '1-11.1\n' | sudo tee /sys/bus/usb/drivers/usb/bind > /dev/null
end
