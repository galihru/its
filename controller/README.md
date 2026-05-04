# ITS Controller

Program Scala utama untuk Raspberry Pi. Default-nya menulis snapshot JSON yang dipoll dashboard GitHub Pages.

## Run

```bash
cd controller
chmod +x run-controller.sh
./run-controller.sh
```

## Environment

```bash
export ITS_OUTPUT_PATH="../web/public/data/its-state.json"
export ITS_DEVICE_ID="raspberry-its"
export ITS_DEVICE_LABEL="Raspberry Pi 5 Controller"
export ITS_DEVICE_DISTRICT="Koridor Utama ITS"
export ITS_INTERVAL_SECONDS="15"
```

## Auto run

Pakai file [its-controller.service](its-controller.service) lalu aktifkan dengan systemd.

Verifikasi setelah reboot:

```bash
sudo systemctl status its-controller.service
journalctl -u its-controller.service -f
```

Kalau statusnya `active (running)`, controller memang auto jalan seperti service, bukan seperti upload firmware Arduino.
