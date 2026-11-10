const fs = require('fs');
const path = require('path');

const content = `# 🤖 Analisis & Rencana Arsitektur: WhatsApp Bot Interaktif Berbasis AI

Dokumen ini berisi analisis lengkap, arsitektur teknis, dan rencana eksekusi untuk mengubah bot WhatsApp Jimpitan dari bot pengirim satu arah (*broadcast only*) menjadi **Asisten Virtual Interaktif Cerdas (AI Agent)** yang mampu menjawab pertanyaan warga dan pengurus seputar data jimpitan, tagihan, saldo kas, dan ronda secara otomatis 24 jam.

---

## 🎯 1. Latar Belakang & Tujuan

Saat ini bot WhatsApp jimpitan sudah berfungsi dengan baik untuk:
- Mengirim pesan broadcast kekurangan bayar per warga.
- Mengirim laporan jimpitan harian ke grup RT.

**Tujuan Pengembangan Lanjutan:**
Memberikan kemampuan kepada bot untuk **membaca pesan masuk**, **memahami maksud (*intent*) pertanyaan warga dengan AI**, **mengambil data riil dari database SQLite**, dan **membalas pesan dengan bahasa yang ramah, sopan, dan berformat rapi**.

---

## 💡 2. Skenario Percakapan Nyata (Use Cases)

| Skenario | Contoh Pertanyaan Warga | Respon Cerdas Bot AI |
| :--- | :--- | :--- |
| **Cek Kekurangan Bulan Tertentu** | *"Tampilkan kekurangan jimpitan bulan november"* | AI memanggil fungsi database untuk bulan 11 tahun 2026, lalu merangkum daftar rumah yang belum bayar beserta nominalnya secara rapi. |
| **Cek Tagihan Rumah Sendiri** | *"Berapa tagihan jimpitan rumah saya?"* | AI mendeteksi nomor WhatsApp pengirim, mencocokkannya ke database \`ref_warga\` (misal Rumah No. 20), dan merinci sisa tagihan rumah tersebut. |
| **Cek Tagihan Nomor Tertentu** | *"Cek tagihan rumah nomor 35 dong"* | AI mencari data Rumah No. 35 dan merinci berapa hari belum bayar serta total rupiahnya. |
| **Cek Saldo Kas Jimpitan** | *"Berapa sisa saldo kas jimpitan sekarang?"* | AI mengambil data saldo terkini, pemasukan, pengeluaran terakhir, dan tanggal update. |
| **Cek Jadwal & Petugas Ronda** | *"Siapa yang ronda malam ini?"* | AI mengambil data presensi ronda hari ini atau jadwal giliran ronda. |
| **Panduan Pembayaran** | *"Cara bayar jimpitan transfer kemana ya?"* | AI memberikan info rekening/DANA Bp. Roni / pembayaran tunai ke Bp. Topik (Rumah No. 43). |
| **Obrolan Umum / Basa-basi** | *"Halo bot, selamat pagi"*, *"Terima kasih"* | AI menjawab ramah sebagai Asisten Virtual Jimpitan GBK Tempel 2. |

---

## 🧠 3. Pemilihan Mesin AI (LLM Engine)

### **Rekomendasi Utama: Google Gemini API (\`gemini-2.0-flash\` atau \`gemini-1.5-flash\`)**

**Mengapa Gemini Flash?**
1. **Kecepatan Respon Tinggi**: Waktu respon di bawah 1 detik (*low latency*), sangat krusial agar chat WhatsApp terasa responsif dan tidak lama menunggu.
2. **Dukungan Function Calling (Tool Use) Sangat Baik**: Gemini mampu memilih fungsi database mana yang harus dipanggil secara presisi berdasarkan teks percakapan warga.
3. **Tersedia Kuota Gratis (Free Tier)**: Google AI Studio menyediakan kuota gratis harian (hingga 1.500 request per hari), yang **lebih dari cukup** untuk melayani chat warga satu perumahan tanpa biaya sama sekali.
4. **Format Output Fleksibel**: Secara alami dapat diformat menggunakan Markdown WhatsApp (\`*bold*\`, \`_italic_\`, bullet point, emoji).

*(Alternatif lain: OpenAI GPT-4o-mini dengan biaya pay-per-token sangat murah, sekitar Rp 2 - Rp 5 per chat).*

---

## 🏗️ 4. Desain Arsitektur Teknis

### Alur Kerja Percakapan (*Workflow Diagram*)

\`\`\`
[1. Warga Kirim Chat] ───► "Tampilkan kekurangan jimpitan bulan november"
         │
         ▼
[2. Baileys WhatsApp] ───► Event: sock.ev.on("messages.upsert")
         │                 Mendeteksi teks chat & nomor pengirim (JID)
         ▼
[3. AI Intent Router] ───► Mengirim prompt ke Gemini API bersama daftar "Tools"
         │
         ▼
[4. Function Call]    ───► Gemini memilih Tool:
         │                 getKekuranganBulan({ bulan: 11, tahun: 2026 })
         ▼
[5. Query SQLite DB]  ───► Menjalankan query ke backend/src/features/laporan/model.js
         │                 Mendapatkan data riil JSON (misal: 27 rumah belum bayar)
         ▼
[6. AI Response Gen]  ───► Gemini menyusun kalimat balasan yang sopan, rapi, dan ber-emoji
         │
         ▼
[7. Kirim Balasan WA] ──► sock.sendMessage(senderJid, { text: balasanAI })
\`\`\`

---

## 🧰 5. Daftar Tool / Fungsi Database yang Disiapkan untuk AI

Untuk menghubungkan AI ke database SQLite jimpitan, kita akan membuat registry tool:

1. \`cek_kekurangan_bulan(bulan, tahun)\`:
   - *Parameter*: \`bulan\` (1-12), \`tahun\` (contoh: 2026)
   - *Fungsi*: Mengambil daftar nomor rumah, nama penghuni, dan nominal kekurangan.
2. \`cek_tagihan_rumah(nomor_rumah, tahun)\`:
   - *Parameter*: \`nomor_rumah\` (1-68), \`tahun\` (opsional, default tahun berjalan)
   - *Fungsi*: Mengambil rincian bulan apa saja yang belum dibayar oleh rumah tersebut.
3. \`cek_saldo_kas_terkini()\`:
   - *Parameter*: Tidak ada.
   - *Fungsi*: Mengambil sisa saldo kas jimpitan dan tanggal saldo terakhir diupdate.
4. \`cek_laporan_harian(tanggal)\`:
   - *Parameter*: \`tanggal\` (format YYYY-MM-DD)
   - *Fungsi*: Mengambil data total uang terkumpul, rumah yang terisi, rapel, dan kosong pada tanggal tersebut.
5. \`cek_petugas_ronda(tanggal)\`:
   - *Parameter*: \`tanggal\` (format YYYY-MM-DD)
   - *Fungsi*: Mengambil daftar warga yang bertugas ronda pada malam tersebut.
6. \`info_rekening_pembayaran()\`:
   - *Parameter*: Tidak ada.
   - *Fungsi*: Memberikan rincian cara pembayaran (Cash ke No. 43 / No. 33, atau Transfer DANA 089673378055).

---

## 🛡️ 6. Keamanan, Privasi, & Tata Kelola Bot

1. **Japri vs Grup**:
   - **Chat Pribadi (Japri)**: Bot selalu merespon setiap pertanyaan yang masuk.
   - **Grup WhatsApp**: Bot hanya merespon jika dimention/ditag (misal: \`@bot tolong cek kas sekarang\`) agar tidak memenuhi grup dengan percakapan yang tidak perlu.
2. **Konteks Memori (Multi-turn Conversation)**:
   - Menyimpan riwayat 3-5 percakapan terakhir per nomor pengirim menggunakan cache lokal (misal selama 10 menit).
   - Memungkinkan percakapan nyambung:
     - Warga: *"Berapa tagihan rumah 10?"* $\\rightarrow$ Bot: *"Rp 500"*
     - Warga: *"Kalau rumah 15?"* $\\rightarrow$ Bot paham maksudnya adalah menanyakan tagihan rumah 15 tanpa perlu mengulang kalimat panjang.
3. **Anti-Spam & Rate Limiting**:
   - Jika satu nomor mengirim lebih dari 3 pesan dalam 5 detik, bot akan memberikan jeda (*typing delay* 2-3 detik) untuk mencegah spam.
4. **Fallback Manusia**:
   - Jika warga menanyakan hal di luar konteks jimpitan/lingkungan atau komplain yang membutuhkan keputusan pengurus, AI akan memberikan jawaban sopan dan menyarankan menghubungi pengurus langsung (Bp. Roni / Bp. Topik).

---

## 📋 7. Rencana Eksekusi Besok (Step-by-Step Action Plan)

| Tahap | Tindakan Teknis | Estimasi Waktu |
| :---: | :--- | :---: |
| **1** | Mendaftarkan API Key Google Gemini di \`backend/.env\` (\`GEMINI_API_KEY=...\`) & install package \`@google/generative-ai\`. | 5 menit |
| **2** | Membuat file service \`backend/src/services/aiService.js\` yang memuat konfigurasi model, system prompt, dan registry fungsi database. | 20 menit |
| **3** | Mengaktifkan listener pesan masuk (\`messages.upsert\`) di \`backend/bailey.js\` dan menyambungkannya ke \`aiService.js\`. | 15 menit |
| **4** | Uji coba interaktif melalui chat WhatsApp nyata (simulasi cek tagihan, cek saldo, dan cek kekurangan). | 15 menit |
| **5** | Menambahkan switch/toggle "Aktifkan AI Bot" di halaman Admin (\`#/admin/status-whatsapp\`) agar pengurus bisa menghidupkan/mematikan fitur interaktif kapan saja. | 15 menit |

---

> [!TIP]
> Dokumen ini siap direview. Besok saat Anda siap mengeksekusi, kita tinggal memasukkan API Key Gemini dan mengaktifkan kodenya langkah demi langkah!
`.replace(/\r\n/g, '\n');

fs.writeFileSync('e:/jimpitan/ANALISIS_FITUR_AI_WHATSAPP.md', content, { encoding: 'utf8' });
console.log('Successfully generated ANALISIS_FITUR_AI_WHATSAPP.md');
