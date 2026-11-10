const fs = require('fs');
const path = require('path');

const mdContent = `# 🚀 Panduan Menjalankan Jimpitan di Linux Mint XFCE

Panduan ini menjelaskan cara memindahkan dan menjalankan aplikasi **Jimpitan** (Backend, Frontend, dan Cloudflare Tunnel) ke laptop lama ber-OS **Linux Mint (XFCE)** secara otomatis dan ringan.

---

## 📌 Ringkasan Penting

1. **Konfigurasi Cloudflare TIDAK Perlu Diulang**:
   - Seluruh mapping domain (\`api-jimpitan...\`, \`jimpitan-gbk...\`) dan port lokal (\`3000\` & \`3001\`) tersimpan di Cloudflare Dashboard di cloud.
   - Laptop hanya bertindak sebagai penghubung (*connector*) menggunakan **Token**.
2. **Database & Data Warga Utuh**:
   - File database SQLite (\`backend/db.sqlite\`) otomatis ikut tersalin. Seluruh data warga, histori transaksi jimpitan, dan saldo kas tetap tersimpan utuh.
3. **Sangat Ringan untuk Laptop Jadul**:
   - Frontend dijalankan menggunakan \`serve.js\` (static server bawaan Node.js tanpa webpack/react-scripts yang berat).
   - Hanya memakan **RAM ~15 MB** dan CPU sangat minim.

---

## 🛠️ Langkah Penggunaan (Sekali Klik)

### Langkah 1: Matikan Tunnel di Laptop Windows (Lama)
> **PENTING**: Sebelum mengaktifkan di Linux Mint, tutup atau matikan jendela command prompt / terminal \`cloudflared\` di laptop Windows lama Anda agar tidak terjadi perebutan koneksi domain.

---

### Langkah 2: Colokkan Flashdisk / HDD ke Laptop Linux Mint
1. Colokkan Flashdisk/HDD eksternal ini ke laptop Linux Mint Anda.
2. Buka pengelola berkas (*File Manager / Thunar*) dan masuk ke folder **\`jimpitan\`**.

---

### Langkah 3: Beri Izin Eksekusi (Hanya Sekali di Awal)
Di Linux, file script memerlukan izin eksekusi sebelum dapat diklik:
1. Klik kanan pada file **\`jalankan-di-linux.sh\`** $\\rightarrow$ pilih **Properties**.
2. Buka tab **Permissions**.
3. Beri centang pada opsi:
   - ✅ **Allow executing file as program** (Izinkan mengeksekusi berkas sebagai program).
4. Klik **Close**.

---

### Langkah 4: Jalankan Script
Ada dua cara mudah:

#### Opsi A: Melalui File Manager (Sekali Klik)
- Klik 2x pada file **\`jalankan-di-linux.sh\`** $\\rightarrow$ pilih **"Run in Terminal"** (*Jalankan di Terminal*).
- *(Atau klik 2x pada ikon **\`Jalankan Jimpitan.desktop\`**)*.

#### Opsi B: Melalui Terminal Linux Mint
Buka Terminal (\`Ctrl + Alt + T\`), lalu jalankan perintah berikut:
\`\`\`bash
# Masuk ke direktori flashdisk (sesuaikan nama USB jika berbeda)
cd /media/$USER/*/jimpitan

# Jalankan script
bash jalankan-di-linux.sh
\`\`\`

---

## ⚙️ Apa yang Dilakukan Script Secara Otomatis?

Ketika script dijalankan, proses berikut berjalan secara otomatis:

1. **Menyalin File ke Penyimpanan Internal**:
   - Menyalin folder \`backend\` dan \`frontend\` ke direktori lokal:
     \`\`\`text
     /home/<username>/jimpitan
     \`\`\`
   - Folder \`node_modules\` Windows dilewati agar proses penyalinan berlangsung super cepat (hanya 3–5 detik).
2. **Pemeriksaan Node.js & npm**:
   - Jika Node.js belum terpasang di laptop, script akan otomatis menginstalnya lewat \`apt\` (mungkin akan meminta password akun Linux Anda).
3. **Instalasi Modul Backend**:
   - Memastikan library database \`sqlite3\` terpasang untuk arsitektur Linux.
4. **Unduh Cloudflared**:
   - Jika binary \`cloudflared\` belum tersedia di sistem, script akan langsung mengunduh binary resmi Linux dari GitHub Cloudflare.
5. **Menjalankan Seluruh Service**:
   - **Backend API**: Port \`3000\` (\`http://localhost:3000\`)
   - **Frontend Web**: Port \`3001\` (\`http://localhost:3001\`)
   - **Cloudflare Tunnel**: Terhubung dengan token resmi
6. **Membuka Browser Otomatis**:
   - Browser default laptop akan otomatis membuka \`https://jimpitan-gbk.roniadiatmoko.my.id\`.

---

## 🌐 Akses Aplikasi

Setelah script menampilkan status hijau di terminal, aplikasi sudah aktif dan dapat diakses:

| Komponen | URL / Endpoint |
| :--- | :--- |
| **Frontend Web (Publik/HP)** | [https://jimpitan-gbk.roniadiatmoko.my.id](https://jimpitan-gbk.roniadiatmoko.my.id) |
| **Backend API (Publik)** | [https://api-jimpitan.roniadiatmoko.my.id](https://api-jimpitan.roniadiatmoko.my.id) |
| **Frontend Lokal (Laptop)** | \`http://localhost:3001\` |
| **Backend Lokal (Laptop)** | \`http://localhost:3000\` |

> **Untuk Menghentikan Server:**  
> Cukup tekan tombol **\`Ctrl + C\`** pada jendela Terminal tersebut. Semua proses server dan tunnel akan berhenti dengan aman.

---

## 🔄 Menjadikan Server Otomatis Hidup Saat Booting (Opsional)

Jika laptop jadul Linux Mint ini ingin Anda gunakan sebagai **mini-server rumahan yang selalu aktif (24 jam)** tanpa perlu klik atau buka terminal setiap kali dinyalakan:

1. Jalankan script sekali terlebih dahulu (agar file tersalin ke \`~/jimpitan\`).
2. Buka Terminal di Linux Mint, lalu jalankan:
   \`\`\`bash
   cd ~/jimpitan
   bash install-service-otomatis.sh
   \`\`\`
3. Masukkan password \`sudo\` saat diminta.
4. **Selesai!** Jimpitan dan Cloudflare Tunnel kini berjalan sebagai *Systemd Service*. Setiap kali laptop dihidupkan atau di-restart, server dan tunnel akan langsung aktif di latar belakang secara otomatis.

---

## 📁 Lokasi File & Log di Laptop Linux Mint

- **Direktori Utama**: \`/home/<user>/jimpitan\`
- **Database SQLite**: \`/home/<user>/jimpitan/backend/db.sqlite\`
- **Log Backend**: \`/home/<user>/jimpitan/backend.log\`
- **Log Frontend**: \`/home/<user>/jimpitan/frontend.log\`
- **Log Tunnel**: \`/home/<user>/jimpitan/tunnel.log\`
`.replace(/\r\n/g, '\n');

fs.writeFileSync('e:/jimpitan/PANDUAN_LINUX.md', mdContent, { encoding: 'utf8' });
console.log('Successfully written e:/jimpitan/PANDUAN_LINUX.md');
