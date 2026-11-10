# 💰 Jimpitan v2 - Backend API & WhatsApp Engine

Backend API dan otomasi bot WhatsApp untuk sistem pencatatan jimpitan warga RT / paguyuban (GBK Tempel 2). Dibangun dengan arsitektur **Offline-First**, mengutamakan keandalan SQLite lokal di laptop/server pos ronda dengan pencerminan (*mirroring*) cloud otomatis ke PostgreSQL / Supabase dan integrasi Google Gemini AI.

---

## 🚀 Fitur Utama

- **Offline-First Local Storage**: Database SQLite lokal (`db.sqlite`) yang cepat, tahan gangguan koneksi internet, dan otomatis diinisialisasi.
- **Cloud Database Mirroring**: Pencerminan data transaksi jimpitan secara otomatis ke PostgreSQL / Supabase di cloud ketika internet aktif.
- **WhatsApp Bot Integration (Baileys)**:
  - Otomatis membuat dan membagikan laporan jimpitan harian ke grup WhatsApp warga.
  - Fitur format pesan salin tagihan rapel dan kekurangan bayar siap tempel ke WhatsApp.
  - Monitoring status sesi WhatsApp dan scan QR melalui web UI.
- **Google Gemini AI Assistant**: Asisten pintar yang menganalisis laporan jimpitan, tren partisipasi warga, serta ringkasan keuangan.
- **Fitur Finansial Lengkap**:
  - Rekap jimpitan harian & hitung ulang nominal fleksibel.
  - Manajemen rapel jimpitan (pelunasan jimpitan di muka atau tunggakan).
  - Manajemen data pengeluaran kas dengan filter per bulan.
  - Rekap saldo tutup buku bulanan & laporan keuangan.
  - Matriks kekurangan bayar tahunan dan rincian bulanan.
  - Master data warga dinamis (Ref Warga).

---

## 📋 Prasyarat

- **Node.js** versi 20.x ke atas (direkomendasikan v20 LTS atau v22)
- **npm** (v9 atau lebih baru)
- **SQLite3**

---

## 🛠️ Instalasi & Menjalankan

1. Masuk ke direktori backend:
   ```bash
   cd backend
   ```

2. Pasang seluruh dependensi:
   ```bash
   npm install
   ```

3. Buat file `.env` dari template:
   ```bash
   cp .env.example .env
   ```
   *(Buka file `.env` dan sesuaikan kredensial yang diperlukan, seperti ID grup WA, kunci Gemini, dan database PostgreSQL).*

4. Jalankan server:
   - **Mode Pengembangan (dengan auto-restart):**
     ```bash
     npm run dev
     ```
   - **Mode Produksi:**
     ```bash
     npm start
     ```
   Server backend akan aktif di `http://localhost:3000`.

---

## ⚙️ Variabel Lingkungan (`.env`)

Lihat [`.env.example`](.env.example) untuk template lengkap. Variabel inti meliputi:

| Variabel | Deskripsi | Contoh |
| :--- | :--- | :--- |
| `PORT` | Port server HTTP backend | `3000` |
| `ENV` | Mode lingkungan (`dev` / `production`) | `production` |
| `SESSION_SECRET` | Kunci rahasia sesi Express | `kunci_acak_32_karakter` |
| `GROUP_ID` | JID WhatsApp Grup tujuan pengiriman laporan | `1203630xxx@g.us` |
| `ENABLE_PG_MIRROR`| Aktifkan sync PostgreSQL cloud (`true`/`false`)| `true` |
| `PGHOST` | Host database PostgreSQL / Supabase | `db.xxxx.supabase.co` |
| `GEMINI_API_KEY` | Kunci API Google Gemini | `AIzaSyD...` |
| `GEMINI_MODEL` | Model AI Gemini yang digunakan | `gemini-2.5-flash` |

---

## 📱 Bot WhatsApp & Sesi

- Sesi otentikasi WhatsApp disimpan di folder `baileys_auth_info/` (jangan pernah membagikan atau meng-commit folder ini).
- Untuk menghubungkan WhatsApp pertama kali, scan QR code yang muncul di terminal atau buka endpoint `/qr` di browser.
- Jika ingin mengganti nomor WhatsApp atau mereset sesi, hapus folder `baileys_auth_info/` lalu restart backend.

---

## 📁 Struktur Direktori

```
backend/
├── baileys_auth_info/     # Kredensial sesi WhatsApp (di-ignore git)
├── db.js                  # Inisialisasi SQLite lokal & query helpers
├── index.js               # Entry point Express API & routing
├── bailey.js              # Service WhatsApp bot Baileys
├── telegram.js            # Service notifikasi Telegram
├── src/
│   ├── features/          # Modul fitur (jimpitan, rapel, rekap, warga, dll)
│   ├── services/          # Layanan AI Gemini & integrasi eksternal
│   └── utils/             # Helper format teks laporan & PostgreSQL mirror
├── scripts/               # Skrip pembantu & sinkronisasi
└── .env.example           # Template environment variable
```
