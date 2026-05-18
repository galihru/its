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

Lokasi marker dikirim oleh controller. Default-nya `Main.scala` mengambil `lat/lng` dari IP geolocation perangkat, lalu publish ke Firebase:

```bash
export ITS_IP_GEOLOCATION_URLS="https://ipapi.co/json/,https://ipwho.is/"
export ITS_GEO_REFRESH_SECONDS="15"
```

Kalau perlu koordinat manual sebagai override, set:

```bash
export ITS_LOCATION_MODE="manual"
export ITS_LATITUDE="-7.280734"
export ITS_LONGITUDE="112.794963"
```

## WebRTC camera

Mode utama kamera sekarang adalah WebRTC. Firebase RTDB dipakai untuk signaling
(`offer`, `answer`, dan ICE candidate), sedangkan video berjalan peer-to-peer
dari Raspberry Pi ke browser.

Install dan aktifkan service kamera di Raspberry Pi:

```bash
cd /home/raspberry5its/its/controller
chmod +x install-webrtc-camera-service.sh
./install-webrtc-camera-service.sh
```

Pastikan controller juga publish metadata WebRTC:

```bash
export ITS_CAMERA_ENABLED=true
export ITS_CAMERA_MODE=webrtc
export ITS_WEBRTC_ENABLED=true
export ITS_WEBRTC_SIGNAL_PATH=webrtc/devices/raspberry-its
```

Verifikasi:

```bash
sudo systemctl status webrtc-camera.service
journalctl -u webrtc-camera.service -f
v4l2-ctl --list-devices
```

Jika service aktif, Firebase akan memiliki:

```text
devices/raspberry-its/cameraMode = webrtc
devices/raspberry-its/webrtcPath = webrtc/devices/raspberry-its
webrtc/devices/raspberry-its/status/status = online
```

Jangan jalankan `camera-stream.service` bersamaan dengan WebRTC karena keduanya
memakai `/dev/video0`.

## Legacy MJPEG camera stream

Controller sekarang mendukung metadata `cameraUrl` yang dapat ditampilkan di dashboard web.

Jalankan streaming kamera dengan `ffmpeg` pada Raspberry Pi:

```bash
cd controller
chmod +x camera-stream.sh
./camera-stream.sh /dev/video0 8080 640 480 10 5
```

Jika berjalan, stream akan tersedia di:

```bash
http://<raspi-ip>:8080/stream.mjpg
```

Contoh environment untuk controller agar menulis URL kamera ke Firebase dan snapshot JSON:

```bash
export ITS_CAMERA_ENABLED=true
export ITS_CAMERA_MODE=mjpeg
export ITS_CAMERA_STREAM_ENABLED=true
export ITS_CAMERA_STREAM_PORT=8080
export ITS_CAMERA_DEVICE=/dev/video0
```

Controller akan otomatis menulis URL stream ke Firebase jika `ITS_CAMERA_MODE=mjpeg` dan `ITS_CAMERA_STREAM_ENABLED=true`.

### Auto start kamera saat Pi menyala

Buat service systemd untuk kamera:

```ini
[Unit]
Description=ITS Raspberry Pi Camera Stream
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=raspberry5its
WorkingDirectory=/home/raspberry5its/its/controller
ExecStart=/home/raspberry5its/its/controller/camera-stream.sh /dev/video0 8080 640 480 10 5
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Simpan sebagai `camera-stream.service`, lalu aktifkan:

```bash
sudo cp camera-stream.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable camera-stream.service
sudo systemctl start camera-stream.service
```

### Auto run controller

Pakai file [its-controller.service](its-controller.service) lalu aktifkan dengan systemd.

Verifikasi setelah reboot:

```bash
sudo systemctl status its-controller.service
journalctl -u its-controller.service -f
```

Kalau statusnya `active (running)`, controller terus berjalan.

### Fallback jika Pi berada di belakang NAT

Jika website tidak dapat mengakses `http://<pi-ip>:8080/stream.mjpg`, gunakan port forwarding pada router:

- forward port `8080` ke IP Raspberry Pi
- gunakan public IP atau dynamic DNS di `ITS_CAMERA_URL`

Contoh:

```bash
export ITS_CAMERA_URL="http://203.0.113.12:8080/stream.mjpg"
```

Firebase hanya digunakan sebagai metadata/penanda stream, bukan media storage.
