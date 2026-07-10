#!/usr/bin/env python3
import os
import sys
import time


def ubx_message(msg_class, msg_id, payload):
    body = bytes([msg_class, msg_id, len(payload) & 0xFF, (len(payload) >> 8) & 0xFF]) + payload
    ck_a = 0
    ck_b = 0
    for value in body:
        ck_a = (ck_a + value) & 0xFF
        ck_b = (ck_b + ck_a) & 0xFF
    return b"\xb5\x62" + body + bytes([ck_a, ck_b])


def cfg_msg(nmea_id):
    # Enable common NMEA sentences on UART1 and USB output channels.
    return ubx_message(0x06, 0x01, bytes([0xF0, nmea_id, 0, 1, 0, 1, 0, 0]))


def main():
    device = sys.argv[1] if len(sys.argv) > 1 else "/dev/serial0"
    baud = sys.argv[2] if len(sys.argv) > 2 else "9600"
    flags = os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK
    try:
        fd = os.open(device, flags)
    except OSError as exc:
        print(f"GPS init skipped: cannot open {device} at {baud}: {exc}", file=sys.stderr)
        return 0

    commands = [
        ubx_message(0x06, 0x08, bytes([0xE8, 0x03, 0x01, 0x00, 0x01, 0x00])),
        cfg_msg(0x00),  # GGA
        cfg_msg(0x01),  # GLL
        cfg_msg(0x02),  # GSA
        cfg_msg(0x03),  # GSV
        cfg_msg(0x04),  # RMC
        cfg_msg(0x05),  # VTG
    ]
    try:
        for command in commands:
            os.write(fd, command)
            time.sleep(0.08)
        print(f"GPS u-blox NMEA init sent to {device} at {baud}")
    finally:
        os.close(fd)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
