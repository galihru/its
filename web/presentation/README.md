# PrezADB Presentation

Entry produksi untuk fitur ini adalah `/presentation/`. File eksperimen lama di
`presentasi/prezadb-browser-only-dynamic-v6.html` hanya menjadi launcher ke entry
Vite ini.

## Menjalankan lokal

```powershell
npm run build
npx firebase emulators:start --only auth,database,hosting --project itstelkom
```

Buka `http://127.0.0.1:5000/presentation/?emulator=1`. Parameter
`emulator=1` wajib ketika memakai emulator agar aplikasi tidak menyentuh Auth dan
RTDB produksi.

Sebelum deploy, aktifkan **Anonymous** pada Firebase Console → Authentication →
Sign-in method. Aplikasi menggunakan anonymous auth untuk kepemilikan project,
presence, rules, signaling WebRTC, dan nama tamu acak.

## Alur USB ADB

1. Gunakan Chrome atau Edge desktop melalui `localhost` atau HTTPS.
2. Aktifkan Developer options dan USB debugging pada Android.
3. Buka kunci HP, sambungkan kabel data, lalu klik **Hubungkan perangkat USB**.
4. Setujui chooser WebUSB di browser dan popup **Allow USB debugging** di HP.
5. Pilih mockup pada slide, pilih device pada panel kanan, lalu klik **Mulai mirror**.

Chooser WebUSB tidak boleh dibuka otomatis saat page load; browser mewajibkan
klik/user gesture. Setelah izin pernah diberikan, **Refresh izin** dapat membuka
kembali perangkat yang sudah diizinkan. Beberapa device dapat dihubungkan dan
setiap mockup menyimpan serial device pilihannya.

Tutup `adb.exe`, Android Studio, scrcpy, Samsung DeX/Smart Switch, atau program
lain yang sedang mengunci interface ADB sebelum memakai WebUSB.

## Sinkronisasi dan live viewer

- `presentations/{projectId}/deck` selalu ditimpa dengan state terbaru; tidak ada
  node histori/revisi.
- Presence anonim berada di `presentationPresence` dan dibersihkan memakai
  `onDisconnect`.
- Link editor memakai capability token. Editor menulis satu snapshot terbaru ke
  antrean token; browser pemilik memvalidasi dan mengganti deck utama. Snapshot
  tetap menunggu jika pemilik sedang offline dan diproses saat pemilik kembali
  dengan browser/profile yang sama.
- RTDB hanya membawa deck, presence, dan signaling. Gambar/video tidak disimpan
  di RTDB.
- Saat **Presentasikan** aktif, seluruh slide digambar ke canvas dan dikirim ke
  viewer melalui WebRTC peer-to-peer. Konfigurasi gratis ini memakai STUN tanpa
  TURN. Jaringan kantor/kampus yang sangat ketat dapat memblokir P2P; jaminan
  koneksi lintas semua jaringan memerlukan TURN, yang umumnya bukan layanan
  gratis tanpa batas.

## Deploy (setelah uji USB fisik)

```powershell
npm run build
npx firebase deploy --only database,hosting --project itstelkom
```

Deploy tidak dilakukan otomatis dari pekerjaan lokal ini.
