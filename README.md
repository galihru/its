# ITS Maps

Dynamic dashboard untuk memantau Raspberry Pi controller, status device, kendaraan, dan layer kamera realtime lewat polling JSON GitHub.

## Struktur

- `web/` - frontend Vite static yang bisa dipublish ke GitHub Pages
- `controller/` - program Scala utama untuk Raspberry Pi
- `web/public/data/its-state.json` - snapshot JSON yang dipoll dashboard
- `web/public/data/its-config.json` - konfigurasi sumber snapshot, interval refresh, dan atribusi peta

## Jalankan frontend

```bash
cd web
npm install
npm run dev
```

## Build frontend

```bash
cd web
npm run build
```

## Raspberry Pi controller

```bash
cd controller
./run-controller.sh
```

## GitHub Pages

Project ini tidak memakai Firebase. Deploy disarankan lewat GitHub Pages dari folder `web/dist`.
URL Pages untuk repo target `hanifasepthi/its` adalah https://hanifasepthi.github.io/its/

Jika ingin sumber data benar-benar live dari GitHub, isi `web/public/data/its-config.json` dengan URL raw file JSON milik repo kamu, lalu biarkan controller Scala menulis snapshot ke file itu sebelum commit/push.

## Workflow Contributor

Kalau kamu bukan pemilik repo utama, pakai fork itu benar. Alur amannya:

1. Fork repo utama ke akun GitHub kamu.
2. Kerjakan perubahan di fork.
3. Push branch ke fork kamu.
4. Aktifkan GitHub Pages di fork tersebut.
5. Kalau data JSON mau dibaca dari repo fork, ganti `githubRepo` dan `snapshotUrl` di `web/public/data/its-config.json`.

## Raspberry Pi

Program controller di folder `controller/` bukan seperti Arduino firmware. Dia bisa auto-run saat boot kalau dipasang sebagai service systemd.

Untuk cek auto-run di Pi:

```bash
cd controller
./run-controller.sh --once
sudo cp its-controller.service /etc/systemd/system/its-controller.service
sudo systemctl daemon-reload
sudo systemctl enable --now its-controller.service
sudo systemctl status its-controller.service
```

Kalau service aktif, berarti program memang jalan otomatis setelah boot.
