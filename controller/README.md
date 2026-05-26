# ITS Controller

Program Scala utama untuk Raspberry Pi. Default-nya menulis snapshot JSON yang dipoll dashboard GitHub Pages.

## Run

```bash
cd controller
chmod +x run-controller.sh
./run-controller.sh
```

Untuk mode publik, pakai:

```bash
chmod +x run-controller-public.sh
./run-controller-public.sh
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

## Traffic LED GPIO

Controller utama sekarang mengendalikan LED dari `Main.scala` lewat modul `TrafficLight.scala`.
Pin default mengikuti wiring Raspberry Pi:

```bash
export ITS_GPIO_ENABLED=true
export ITS_GPIO_RED_PIN=17
export ITS_GPIO_YELLOW_PIN=27
export ITS_GPIO_GREEN_PIN=22
```

Di Raspberry Pi OS baru, controller akan mencoba `pinctrl`, lalu `raspi-gpio`, lalu sysfs.
Pastikan service berjalan dengan akses group:

```ini
SupplementaryGroups=gpio video
```

## YOLO object detector

YOLO dijalankan sebagai modul Scala `YoloDetector.scala` dengan model ONNX. Model default:

```bash
export ITS_YOLO_ENABLED=true
export ITS_YOLO_MODEL_PATH="/home/raspberry5its/models/yolo26n.onnx"
export ITS_YOLO_CAMERA_SOURCE="rtsp://user:pass@camera-ip/stream1"
export ITS_YOLO_CONFIDENCE=0.25
```

`ITS_YOLO_CAMERA_SOURCE` bisa berupa `/dev/video0`, RTSP, HTTP MJPEG, atau URL kamera publik yang benar-benar stream video. Jika tidak diisi, controller memakai URL kamera publik (`ITS_CAMERA_PUBLIC_URL` / `ITS_CAMERA_WEBRTC_URL`) atau fallback `/dev/video0`.

Detector sekarang mengirim semua objek COCO yang lolos confidence threshold, termasuk `person`. Variabel `vehicleCount` dan LED tetap hanya menghitung kelas kendaraan:

```bash
export ITS_YOLO_VEHICLE_CLASSES="car,motorcycle,bus,truck,bicycle"
```

Kalau ingin membatasi objek yang ditampilkan untuk debugging, isi `ITS_YOLO_DETECTION_CLASSES`. Biarkan kosong agar semua objek dikirim:

```bash
export ITS_YOLO_DETECTION_CLASSES=""
```

Install runtime dan export model ONNX di Raspberry Pi:

```bash
cd /home/raspberry5its/its/controller
chmod +x install-yolo-runtime.sh
./install-yolo-runtime.sh
```

Output detector dikirim ke Firebase dan JSON lokal sebagai:

```text
vehicleCount
vehicleBreakdown.car / motorcycle / bus / truck / bicycle
detections[].label / confidence / vehicle / x / y / width / height
detectorFrameWidth / detectorFrameHeight
objectCount
detectorStatus
detectorFps
trafficColor
trafficDurationSec
gpioReady
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

Kalau ingin auto-update JAR dari hosting Firebase, aktifkan juga [its-controller-update.timer](its-controller-update.timer) dan [its-controller-update.service](its-controller-update.service).
Script [update-controller.sh](update-controller.sh) sekarang memakai alur aman:

1. download JAR baru ke file sementara,
2. bandingkan dengan `ItsController.jar` yang sedang terpasang,
3. jika berbeda, stop `its-controller.service`,
4. backup JAR lama ke `ItsController.jar.previous`,
5. timpa `ItsController.jar`,
6. default reboot Raspberry Pi agar service auto-start menjalankan JAR baru.

Kalau ingin restart service tanpa reboot penuh, set:

```bash
export ITS_CONTROLLER_REBOOT_AFTER_UPDATE=false
```

Untuk memasang file controller tertentu saja dari folder repo ke Raspberry Pi:

```bash
cd /home/raspberry5its/its/controller
chmod +x install-controller-files.sh
./install-controller-files.sh
```

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
