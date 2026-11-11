// index.js
require("dotenv").config(); // Load environment variables from .env file
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const moment = require("moment-timezone");
const { format, isValid, parse } = require("date-fns");

const hitungUlangRouter = require("./src/features/hitung_ulang_jimpitan_harian/routes");
const laporanRouter = require("./src/features/laporan/routes");
const presensiRondaRouter = require("./src/features/presensi-ronda/routes");
const rekapRouter = require("./src/features/rekap/routes");
const { savePresensiRonda } = require("./src/features/presensi-ronda/model");

// Import fungsi dari db.js
const {
  db,
  ambilSemuaData,
  ambilJimpitanPerBulan,
  hapusDanSimpanJimpitanHarian,
  ambilLaporanHarian,
  simpanRapelHarian,
  ambilRapelHarian,
  ambilRapelBulanan,
  ambilTanggalJimpitanKosong,
  ambilTanggalRapelTerisi,
  ambilPengeluaran,
  ambilStatusJimpitanRumahPerBulan,
  simpanPengeluaran,
  hapusPengeluaran,
  updatePengeluaran,
  simpanTanggalPemutihan,
  ambilTanggalPemutihan,
  hapusTanggalPemutihan,
  simpanRefWarga,
  updateRefWarga,
  ambilRefWarga,
  hapusRefWarga,
} = require("./db");

const {
  getUserByUsername,
  verifyPassword,
  hashPassword,
  updateUserPasswordHash,
  updatePassword,
  listUsers,
  parseAdminUsersEnv,
} = require("./src/features/auth/userModel");

const {
  startBot,
  kirimTesWhatsApp,
  kirimLaporanWhatsApp,
  resendLaporanWhatsApp,
  kirimPesanWhatsApp,
  getLatestQr,
  onBotReady,
  getBotStatus,
  logoutBot,
  restartBot,
} = require("./bailey"); // pastikan nama file sesuai

const {
  kirimLaporanTelegram,
  kirimDatabaseTelegram,
  kirimRekapBulananJikaAkhirBulan,
  kirimBackupDatabaseTelegram,
} = require("./telegram");
const { wakeLayerbase } = require("./src/utils/postgresMirror");

const app = express();
const PORT = process.env.PORT || 3000;
const API_SECRET_KEY = process.env.API_SECRET_KEY || "rahasiakita123";

console.log(">>> Memulai server...");
app.use(cors());
app.use(bodyParser.json());

// --- SECTION: ROUTES ---

app.get("/", (req, res) => {
  console.log(">>> Menerima permintaan. Server aktif.");
  void wakeLayerbase();
  res.send("Halo dari server jimpitan Replit! Server berjalan dengan baik.");
});

// Endpoint khusus untuk ping UptimeRobot
app.get("/ping", (req, res) => {
  console.log(">>> Menerima ping UptimeRobot, server tetap aktif.");
  res.status(200).send("Server is alive!");
});

// Endpoint autentikasi login admin pengurus (didukung tabel database users & hash scrypt)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ status: "ERROR", message: "Username dan kata sandi wajib diisi." });
    }

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    // 1. Cek di tabel database users
    const user = await getUserByUsername(db, cleanUsername);
    if (user) {
      const isValid = verifyPassword(cleanPassword, user.password_hash);
      if (isValid) {
        // Otomatis upgrade ke hash scrypt jika masih plain-text
        if (!user.password_hash.startsWith("scrypt$")) {
          const newHash = hashPassword(cleanPassword);
          await updateUserPasswordHash(db, user.id, newHash);
        }

        return res.json({
          status: "OK",
          token: "true",
          user: {
            id: user.id,
            username: user.username,
            fullname: user.fullname,
            role: user.role,
          },
        });
      }
    }

    // 2. Fail-safe fallback ke .env ADMIN_USERS jika db bermasalah atau user belum ter-seed
    const envAccounts = parseAdminUsersEnv();
    const matchedEnv = envAccounts.find(
      (acc) => acc.username === cleanUsername && acc.password === cleanPassword
    );

    if (matchedEnv) {
      return res.json({
        status: "OK",
        token: "true",
        user: {
          username: matchedEnv.username,
          fullname: matchedEnv.fullname,
          role: matchedEnv.role,
        },
      });
    }

    return res.status(401).json({
      status: "UNAUTHORIZED",
      message: "Username atau kata sandi salah. Coba lagi.",
    });
  } catch (err) {
    console.error("Error saat autentikasi admin:", err);
    return res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Endpoint ganti kata sandi pengurus
app.post("/api/auth/change-password", async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body || {};
    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ status: "ERROR", message: "Semua kolom kata sandi wajib diisi." });
    }

    if (newPassword.trim().length < 4) {
      return res.status(400).json({ status: "ERROR", message: "Kata sandi baru minimal 4 karakter." });
    }

    const cleanUsername = username.trim();
    const user = await getUserByUsername(db, cleanUsername);
    if (!user) {
      return res.status(404).json({ status: "ERROR", message: "Akun pengurus tidak ditemukan di database." });
    }

    const isValid = verifyPassword(currentPassword.trim(), user.password_hash);
    if (!isValid) {
      return res.status(400).json({ status: "ERROR", message: "Kata sandi saat ini tidak sesuai." });
    }

    await updatePassword(db, cleanUsername, newPassword.trim());
    return res.json({ status: "OK", message: "Kata sandi berhasil diperbarui." });
  } catch (err) {
    console.error("Error change password:", err);
    return res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Endpoint melihat daftar akun pengurus (tanpa hash password)
app.get("/api/auth/users", async (req, res) => {
  try {
    const users = await listUsers(db);
    return res.json({ status: "OK", data: users });
  } catch (err) {
    console.error("Error list users:", err);
    return res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Endpoint untuk mengambil semua data
app.get("/api/jimpitan", async (req, res) => {
  try {
    const data = await ambilSemuaData();
    res.json({ status: "OK", data });
  } catch (err) {
    console.error("Error saat mengambil data jimpitan:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Endpoint riwayat status isi/tidak rumah per bulan (hanya tanggal yang sudah diisikan petugas ronda)
app.get("/api/jimpitan/status-rumah/:nomor_rumah/:bulan", async (req, res) => {
  try {
    const { nomor_rumah, bulan } = req.params;
    const riwayat = await ambilStatusJimpitanRumahPerBulan(nomor_rumah, bulan);
    res.json({
      status: "OK",
      nomor_rumah,
      bulan,
      total_tanggal: riwayat.length,
      riwayat,
    });
  } catch (err) {
    console.error("Error saat mengambil status jimpitan per rumah:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Get harian jimpitan per bulan, yyyy-mm
app.get("/api/jimpitan/:bulan", async (req, res) => {
  try {
    const data = await ambilJimpitanPerBulan(req.params.bulan);
    res.json({ status: "OK", data });
  } catch (err) {
    console.error("Error saat mengambil data jimpitan:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Get tanggal rapel by nomor rumah dan bulan
app.get("/api/detail-rapel-per-rumah/:nomor_rumah/:bulan", async (req, res) => {
  try {
    const data = await ambilTanggalRapelTerisi(
      req.params.nomor_rumah,
      req.params.bulan,
    );
    res.json({ status: "OK", tanggalRapel: data });
  } catch (err) {
    console.error("Error saat mengambil data rapel per rumah:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// ==== WhatsApp bot state ====
let isBotStarted = false;
function ensureBotStarted() {
  if (!isBotStarted) {
    console.log(">>> Starting WhatsApp bot for first time...");
    startBot();
    isBotStarted = true;
  }
}

// Endpoint untuk menyimpan data + kirim laporan WA otomatis
app.post("/api/jimpitan", async (req, res) => {
  try {
    const { secret_key, tanggal, diambil_oleh, data, personil_ronda } = req.body;

    if (secret_key !== API_SECRET_KEY) {
      return res.status(401).json({ status: "UNAUTHORIZED" });
    }

    if (!Array.isArray(data)) {
      return res.status(400).json({ status: "INVALID_DATA_FORMAT" });
    }

    await hapusDanSimpanJimpitanHarian(tanggal, diambil_oleh, data);

    // Fitur 1-Klik: Simpan otomatis presensi personil ronda jika dikirim bersamaan
    if (Array.isArray(personil_ronda)) {
      try {
        await savePresensiRonda(tanggal, personil_ronda);
        console.log(`[POST /api/jimpitan] 1-Klik: Tersimpan ${personil_ronda.length} personil ronda untuk ${tanggal}`);
      } catch (presensiErr) {
        console.error("[POST /api/jimpitan] Gagal simpan presensi ronda:", presensiErr.message);
      }
    }

    // Pastikan bot nyala, tapi hanya sekali
    ensureBotStarted();

    // Kirim laporan ketika bot sudah ready
    onBotReady(async () => {
      try {
        console.log(">>> Bot is ready, sending WhatsApp message...");
        await kirimLaporanWhatsApp(tanggal);
      } catch (err) {
        console.error(">>> Gagal kirim laporan WA otomatis:", err);
      }
    });

    // Backup: selalu kirim laporan yang sama ke Telegram, independen dari status bot WhatsApp
    kirimLaporanTelegram(tanggal).catch((err) =>
      console.error(">>> Gagal kirim backup laporan ke Telegram:", err),
    );

    // Backup fisik database (.sqlite.gz) ke Telegram setiap kali petugas ronda selesai input
    kirimBackupDatabaseTelegram(tanggal).catch((err) =>
      console.error(">>> Gagal kirim backup database ke Telegram:", err),
    );

    // Jika tanggal adalah hari terakhir bulan ini, kirim rekap bulanan + export DB ke Telegram
    kirimRekapBulananJikaAkhirBulan(tanggal).catch((err) =>
      console.error(">>> Gagal kirim rekap bulanan ke Telegram:", err),
    );

    res.json({ status: "OK", total: data.length });
  } catch (err) {
    console.error("Error saat menyimpan data jimpitan:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.get("/api/resend-laporan-jimpitan/:tanggal", async (req, res) => {
  const { tanggal } = req.params;
  console.log(">>> Menerima permintaan kirim ulang laporan jimpitan");

  ensureBotStarted();

  onBotReady(async () => {
    try {
      console.log(">>> Bot is ready, resend laporan jimpitan (testing)...");
      await resendLaporanWhatsApp(tanggal);
    } catch (err) {
      console.error(">>> Gagal resend laporan WA (testing):", err);
    }
  });

  res.json({ status: "OK", message: "Proses resend dimulai, cek whatsapp" });
});

app.get("/api/kirim-laporan-jimpitan/:tanggal", async (req, res) => {
  const { tanggal } = req.params;
  console.log(
    ">>> Menerima permintaan kirim ulang laporan jimpitan grup utama",
  );

  ensureBotStarted();

  onBotReady(async () => {
    try {
      console.log(">>> Bot is ready, kirim laporan ke grup utama...");
      await kirimLaporanWhatsApp(tanggal);
    } catch (err) {
      console.error(">>> Gagal kirim laporan WA (grup utama):", err);
    }
  });

  res.json({
    status: "OK",
    message: "Proses kirim laporan dimulai, cek whatsapp",
  });
});

app.get("/api/tes-wa", async (req, res) => {
  console.log(">>> Menerima permintaan tes WhatsApp...");

  ensureBotStarted();

  onBotReady(async () => {
    try {
      console.log(">>> Bot is ready, sending test WhatsApp message...");
      await kirimTesWhatsApp("Test message from Jimpitan server");
    } catch (err) {
      console.error(">>> Gagal kirim pesan tes WA:", err);
    }
  });

  res.json({ status: "OK", message: "Tes dimulai, cek whatsapp" });
});

// Tes kirim laporan harian jimpitan ke Telegram untuk tanggal tertentu (yyyy-MM-dd)
app.get("/api/tes-telegram-laporan/:tanggal", async (req, res) => {
  try {
    const { tanggal } = req.params;

    const parsedDate = parse(tanggal, "yyyy-MM-dd", new Date());
    if (!isValid(parsedDate)) {
      return res.status(400).json({
        status: "ERROR",
        message: "Format tanggal tidak valid. Gunakan YYYY-MM-DD.",
      });
    }

    await kirimLaporanTelegram(tanggal);
    res.json({ status: "OK", message: "Laporan harian dikirim ke Telegram, cek chat." });
  } catch (err) {
    console.error("Error saat tes kirim laporan Telegram:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Tes kirim export database bulanan ke Telegram untuk bulan tertentu (yyyy-MM)
app.get("/api/tes-telegram-database/:bulan", async (req, res) => {
  try {
    const { bulan } = req.params;

    if (!/^\d{4}-\d{2}$/.test(bulan)) {
      return res.status(400).json({
        status: "ERROR",
        message: "Format bulan tidak valid. Gunakan YYYY-MM.",
      });
    }

    await kirimDatabaseTelegram(bulan);
    res.json({ status: "OK", message: "Export database dikirim ke Telegram, cek chat." });
  } catch (err) {
    console.error("Error saat tes kirim database Telegram:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Kirim pesan WhatsApp ke nomor individu (text panjang didukung)
app.post("/api/kirim-whatsapp", async (req, res) => {
  try {
    const { secret_key, pesan, no_hp } = req.body;

    if (secret_key !== API_SECRET_KEY) {
      return res.status(401).json({ status: "UNAUTHORIZED" });
    }

    if (!pesan || !no_hp) {
      return res.status(400).json({ status: "ERROR", message: "Parameter 'pesan' dan 'no_hp' wajib." });
    }

    await kirimPesanWhatsApp(pesan, no_hp);

    res.json({ status: "OK", message: "Pesan dijadwalkan dan dikirim." });
  } catch (err) {
    console.error("Error saat mengirim pesan WhatsApp:", err);
    res.status(500).json({ status: "ERROR", message: String(err) });
  }
});


// ==== WhatsApp Status & Management ====
app.get("/api/whatsapp/status", async (req, res) => {
  try {
    const autoStart = req.query.auto_start === "true";
    let status = getBotStatus();
    if (!status.connected && !status.starting && autoStart) {
      startBot();
      await new Promise((r) => setTimeout(r, 1500));
      status = getBotStatus();
    }
    const qrUrl = status.qr
      ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(status.qr)}`
      : null;
    res.json({
      status: "OK",
      data: {
        ...status,
        qr_url: qrUrl,
        env: process.env.ENV || (process.env.NODE_ENV === "production" ? "production" : "dev"),
      },
    });
  } catch (err) {
    console.error("Error in /api/whatsapp/status:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.post("/api/whatsapp/start", async (req, res) => {
  try {
    await restartBot();
    await new Promise((r) => setTimeout(r, 1500));
    const status = getBotStatus();
    const qrUrl = status.qr
      ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(status.qr)}`
      : null;
    res.json({
      status: "OK",
      message: "WhatsApp bot dimulai.",
      data: { ...status, qr_url: qrUrl },
    });
  } catch (err) {
    console.error("Error in /api/whatsapp/start:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.post("/api/whatsapp/logout", async (req, res) => {
  try {
    await logoutBot();
    res.json({ status: "OK", message: "Sesi WhatsApp berhasil dikeluarkan (logout)." });
  } catch (err) {
    console.error("Error in /api/whatsapp/logout:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.post("/api/whatsapp/test", async (req, res) => {
  try {
    const status = getBotStatus();
    if (!status.connected) {
      return res.status(400).json({
        status: "ERROR",
        message: "WhatsApp belum terhubung. Silakan scan QR terlebih dahulu.",
      });
    }
    const { target_phone, message } = req.body || {};
    const textToSend = message || `Halo! Ini adalah pesan tes dari Aplikasi Jimpitan GBK Tempel 2 pada ${new Date().toLocaleString("id-ID")}.`;
    
    if (target_phone) {
      await kirimPesanWhatsApp(textToSend, target_phone);
    } else {
      await kirimTesWhatsApp(textToSend);
    }
    res.json({ status: "OK", message: "Pesan tes berhasil dikirim!" });
  } catch (err) {
    console.error("Error in /api/whatsapp/test:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});


app.post("/api/whatsapp/chat-test", async (req, res) => {
  try {
    const { message, sender, pushName, isGroup } = req.body || {};
    const { prosesPesanDenganAI } = require("./src/services/aiService");
    const reply = await prosesPesanDenganAI(
      message || "Halo",
      sender || "6289673378055@s.whatsapp.net",
      sender || "6289673378055@s.whatsapp.net",
      {
        pushName: pushName || "Roni Adiatmoko",
        isGroup: isGroup || false
      }
    );
    res.json({ status: "OK", reply });
  } catch (err) {
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// ==== Cloud Database Sync (PostgreSQL <-> Local SQLite) ====
const {
  getPreviewStatus,
  executeFullPull,
  executeFullPush,
} = require("./src/services/cloudSyncService");

app.get("/api/database/sync-preview", async (req, res) => {
  try {
    const data = await getPreviewStatus();
    res.json({ status: "OK", data });
  } catch (err) {
    console.error("Error in /api/database/sync-preview:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.post("/api/database/push-to-cloud", async (req, res) => {
  try {
    const result = await executeFullPush();
    res.json(result);
  } catch (err) {
    console.error("Error in /api/database/push-to-cloud:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.post("/api/database/pull-from-cloud", async (req, res) => {
  try {
    const force = req.body?.force === true;
    const result = await executeFullPull(force);
    res.json(result);
  } catch (err) {
    console.error("Error in /api/database/pull-from-cloud:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.get("/api/database/mode", (req, res) => {
  try {
    const { getAppMode } = require("./src/services/cloudSyncService");
    res.json({ status: "OK", data: getAppMode() });
  } catch (err) {
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.post("/api/database/switch-mode", async (req, res) => {
  try {
    const { switchAppMode } = require("./src/services/cloudSyncService");
    const { target_mode, pull_first } = req.body || {};
    const result = await switchAppMode(target_mode, pull_first !== false);
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});



app.post("/api/database/backup-telegram", async (req, res) => {
  try {
    const result = await kirimBackupDatabaseTelegram();
    res.json(result);
  } catch (err) {
    console.error("Error in /api/database/backup-telegram:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// --- Endpoint untuk mengambil laporan harian berdasarkan tanggal ---
app.get("/api/laporan/:tanggal", async (req, res) => {
  try {
    const { tanggal } = req.params;

    // Validasi format tanggal (misal: YYYY-MM-DD)
    const parsedDate = parse(tanggal, "yyyy-MM-dd", new Date());
    if (!isValid(parsedDate)) {
      return res.status(400).json({
        status: "ERROR",
        message: "Format tanggal tidak valid. Gunakan YYYY-MM-DD.",
      });
    }

    const laporan = await ambilLaporanHarian(tanggal);

    if (laporan.laporan.length === 0) {
      return res.status(404).json({
        status: "NOT_FOUND",
        message: `Data untuk tanggal ${tanggal} tidak ditemukan.`,
      });
    }

    res.json({ status: "OK", data: laporan });
  } catch (err) {
    console.error("Error saat mengambil laporan:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// --- Endpoint POST untuk fitur rapel ---
app.post("/api/rapel", async (req, res) => {
  try {
    const { secret_key, nomor_rumah, nominal, bulan } = req.body;

    if (secret_key !== API_SECRET_KEY) {
      return res.status(401).json({ status: "UNAUTHORIZED" });
    }

    const nominalPerDay = 500;
    const hariRapel = Math.floor(nominal / nominalPerDay);
    console.log("hari rapel:", hariRapel);

    if (hariRapel <= 0) {
      return res.status(400).json({
        status: "ERROR",
        message: "Nominal tidak mencukupi untuk 1 hari jimpitan.",
      });
    }

    const bulanTerpilih = bulan;

    // 1. Ambil daftar tanggal jimpitan yang kosong di bulan ini
    const tanggalJimpitanKosong = await ambilTanggalJimpitanKosong(
      nomor_rumah,
      bulanTerpilih,
    );
    console.log("tanggal jimpitan kosong:", tanggalJimpitanKosong);

    // 2. Ambil daftar tanggal yang sudah dirapel di bulan ini
    const tanggalRapelTerisi = await ambilTanggalRapelTerisi(
      nomor_rumah,
      bulanTerpilih,
    );
    console.log("tanggal rapel terisi:", tanggalRapelTerisi);

    // 2b. Ambil daftar tanggal pemutihan di bulan ini
    const tanggalPemutihanRows = await ambilTanggalPemutihan(bulanTerpilih);
    const tanggalPemutihan = tanggalPemutihanRows.map((row) => row.tanggal);
    console.log("tanggal pemutihan:", tanggalPemutihan);

    // 3. Gabungkan kedua daftar untuk menemukan hari yang benar-benar kosong,
    //    lalu kecualikan tanggal pemutihan sehingga tidak disimpan ke rapel.
    const hariUntukDirapel = tanggalJimpitanKosong.filter(
      (tanggal) =>
        !tanggalRapelTerisi.includes(tanggal) &&
        !tanggalPemutihan.includes(tanggal),
    );
    console.log("hari untuk dirapel:", hariUntukDirapel);

    // 4. Batasi jumlah hari rapel sesuai nominal
    const tanggalYangDisimpan = hariUntukDirapel.slice(0, hariRapel);
    console.log("tanggal yang disimpan:", tanggalYangDisimpan);

    if (tanggalYangDisimpan.length === 0) {
      return res.status(404).json({
        status: "NOT_FOUND",
        message: `Tidak ada hari jimpitan kosong untuk rumah No. ${nomor_rumah} di bulan ini.`,
      });
    }

    // 5. Simpan setiap tanggal ke database
    const promises = tanggalYangDisimpan.map((tanggal) =>
      simpanRapelHarian(nomor_rumah, tanggal),
    );
    await Promise.all(promises);

    res.json({
      status: "OK",
      message: `Berhasil mencatat rapel ${tanggalYangDisimpan.length} hari untuk rumah ${nomor_rumah}.`,
      hariYangDisimpan: tanggalYangDisimpan,
    });
  } catch (err) {
    console.error("Error saat mencatat rapel:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Endpoint POST untuk pembayaran rapel multi-bulan (diurutkan kronologis dari bulan terlama ke terbaru)
app.post("/api/rapel/bayar-multi-bulan", async (req, res) => {
  try {
    const { secret_key, nomor_rumah, nominal, daftar_bulan } = req.body;

    if (secret_key !== API_SECRET_KEY) {
      return res.status(401).json({ status: "UNAUTHORIZED" });
    }

    const nominalNum = Number(nominal) || 0;
    if (nominalNum < 500) {
      return res.status(400).json({
        status: "ERROR",
        message: "Nominal pembayaran minimal Rp 500 (1 hari jimpitan).",
      });
    }

    if (!Array.isArray(daftar_bulan) || daftar_bulan.length === 0) {
      return res.status(400).json({
        status: "ERROR",
        message: "Pilih setidaknya satu bulan untuk pembayaran rapel.",
      });
    }

    const { getHitungKekurangan } = require("./src/features/laporan/model");
    let sisaHariBayar = Math.floor(nominalNum / 500);
    const totalHariAwal = sisaHariBayar;
    const hasilPerBulan = [];
    const semuaTanggalDisimpan = [];

    // Urutkan daftar bulan secara kronologis (misal: "2026-09", "2026-10")
    const sortedBulan = [...daftar_bulan].sort();

    for (const bln of sortedBulan) {
      if (sisaHariBayar <= 0) break;

      const dataBulan = await getHitungKekurangan(bln);
      const rowRumah = dataBulan.find((r) => String(r.nomor_rumah) === String(nomor_rumah));
      const hariKurangList = rowRumah?.tanggal_kurang || [];

      if (hariKurangList.length === 0) {
        hasilPerBulan.push({
          bulan: bln,
          status: "SUDAH_LUNAS",
          hari_disimpan: 0,
          nominal_disimpan: 0,
          sisa_hari_belum_lunas: 0,
          sisa_nominal_belum_lunas: 0,
        });
        continue;
      }

      const alokasiHari = Math.min(sisaHariBayar, hariKurangList.length);
      const tanggalSimpan = hariKurangList.slice(0, alokasiHari);

      for (const tgl of tanggalSimpan) {
        await simpanRapelHarian(nomor_rumah, tgl);
        semuaTanggalDisimpan.push(tgl);
      }

      sisaHariBayar -= alokasiHari;
      const sisaHariBulanIni = hariKurangList.length - alokasiHari;

      hasilPerBulan.push({
        bulan: bln,
        status: sisaHariBulanIni === 0 ? "LUNAS" : "SEBAGIAN",
        hari_disimpan: alokasiHari,
        nominal_disimpan: alokasiHari * 500,
        sisa_hari_belum_lunas: sisaHariBulanIni,
        sisa_nominal_belum_lunas: sisaHariBulanIni * 500,
      });
    }

    const totalHariDisimpan = totalHariAwal - sisaHariBayar;
    const kelebihanNominal = sisaHariBayar * 500;

    res.json({
      status: "OK",
      message: `Berhasil mencatat pembayaran rapel ${totalHariDisimpan} hari (Rp ${new Intl.NumberFormat("id-ID").format(totalHariDisimpan * 500)}) untuk rumah No. ${nomor_rumah}.`,
      total_hari_disimpan: totalHariDisimpan,
      total_nominal_disimpan: totalHariDisimpan * 500,
      kelebihan_nominal: kelebihanNominal,
      hasil_per_bulan: hasilPerBulan,
      tanggal_disimpan: semuaTanggalDisimpan,
    });
  } catch (err) {
    console.error("Error saat mencatat rapel multi bulan:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Endpoint hitung kebutuhan nominal rapel untuk melunaskan bulan terpilih
app.get("/api/rapel/kebutuhan-lunas/:nomor_rumah/:bulan", async (req, res) => {
  try {
    const { nomor_rumah, bulan } = req.params;
    const tanggalJimpitanKosong = await ambilTanggalJimpitanKosong(nomor_rumah, bulan);
    const tanggalRapelTerisi = await ambilTanggalRapelTerisi(nomor_rumah, bulan);
    const tanggalPemutihanRows = await ambilTanggalPemutihan(bulan);
    const tanggalPemutihan = tanggalPemutihanRows.map((row) => row.tanggal);

    const hariUntukDirapel = tanggalJimpitanKosong.filter(
      (tanggal) =>
        !tanggalRapelTerisi.includes(tanggal) &&
        !tanggalPemutihan.includes(tanggal),
    );

    const sisaHari = hariUntukDirapel.length;
    const nominalLunas = sisaHari * 500;

    res.json({
      status: "OK",
      nomor_rumah,
      bulan,
      sisa_hari: sisaHari,
      nominal_lunas: nominalLunas,
      tanggal_belum_lunas: hariUntukDirapel,
    });
  } catch (err) {
    console.error("Error saat menghitung kebutuhan lunas rapel:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Endpoint baru untuk mengambil status rapel harian
app.get("/api/rapel-harian/:tanggal", async (req, res) => {
  try {
    const { tanggal } = req.params;
    const rapelHouses = await ambilRapelHarian(tanggal);
    res.json({ status: "OK", rapelHouses });
  } catch (err) {
    console.error("Error saat mengambil status rapel harian:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Mengambil daftar rapel bulanan
app.get("/api/rapel-bulanan/:bulan", async (req, res) => {
  try {
    const { bulan } = req.params;
    const rapelBulanan = await ambilRapelBulanan(bulan);
    console.log(bulan);
    res.json({ status: "OK", rapelBulanan });
  } catch (err) {
    console.error("Error saat mengambil status rapel bulanan:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Mengambil daftar pengeluaran
app.get("/api/pengeluaran/:bulan", async (req, res) => {
  try {
    const { bulan } = req.params;
    const pengeluaran = await ambilPengeluaran(bulan);
    console.log("pengeluaran", bulan);
    res.json({ status: "OK", pengeluaran });
  } catch (err) {
    console.error("Error saat mengambil status pengeluaran:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Menyimpan pengeluaran
app.post("/api/pengeluaran", async (req, res) => {
  try {
    console.log(">>> Menerima POST pengeluaran:", req.body);
    const { tanggal, nominal, penanggung_jawab, keterangan, bukti_foto } =
      req.body;
    await simpanPengeluaran(
      tanggal,
      nominal,
      penanggung_jawab,
      keterangan,
      bukti_foto,
    );
    res.json({ status: "OK" });
  } catch (err) {
    console.error("Error saat menyimpan pengeluaran:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// --- API ref_warga ---
app.get("/api/ref-warga", async (req, res) => {
  try {
    const data = await ambilRefWarga();
    res.json({ status: "OK", data });
  } catch (err) {
    console.error("Error saat mengambil ref_warga:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.get("/api/ref-warga/:nomor", async (req, res) => {
  try {
    const { nomor } = req.params;
    const data = await ambilRefWarga(nomor);
    if (!data) {
      return res.status(404).json({ status: "NOT_FOUND", message: "Warga tidak ditemukan." });
    }
    res.json({ status: "OK", data });
  } catch (err) {
    console.error("Error saat mengambil ref_warga per nomor:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.post("/api/ref-warga", async (req, res) => {
  try {
    const { nomor, nama, sudah_menghuni, tanggal_huni, no_hp } = req.body;
    const resultNomor = await simpanRefWarga(nomor, nama, sudah_menghuni, tanggal_huni, no_hp);
    res.json({ status: "OK", nomor: resultNomor });
  } catch (err) {
    console.error("Error saat menyimpan ref_warga:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.put("/api/ref-warga/:nomor", async (req, res) => {
  try {
    const { nomor } = req.params;
    const { nomor: newNomor, nama, sudah_menghuni, tanggal_huni, no_hp } = req.body;
    const targetNomor = newNomor != null ? newNomor : nomor;
    const changes = await updateRefWarga(nomor, targetNomor, nama, sudah_menghuni, tanggal_huni, no_hp);
    if (!changes) {
      return res.status(404).json({ status: "NOT_FOUND", message: "Warga tidak ditemukan atau tidak ada perubahan." });
    }
    res.json({ status: "OK", changes });
  } catch (err) {
    console.error("Error saat mengupdate ref_warga:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.delete("/api/ref-warga/:nomor", async (req, res) => {
  try {
    const { nomor } = req.params;
    const changes = await hapusRefWarga(nomor);
    if (!changes) {
      return res.status(404).json({ status: "NOT_FOUND", message: "Warga tidak ditemukan." });
    }
    res.json({ status: "OK", changes });
  } catch (err) {
    console.error("Error saat menghapus ref_warga:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// --- Tanggal Pemutihan: list, create, delete ---
app.get("/api/tanggal-pemutihan", async (req, res) => {
  try {
    const { bulan, tahun } = req.query; // optional: yyyy-mm or yyyy
    const rows = await ambilTanggalPemutihan(bulan, tahun);
    res.json({ status: "OK", data: rows });
  } catch (err) {
    console.error("Error saat mengambil tanggal pemutihan:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.post("/api/tanggal-pemutihan", async (req, res) => {
  try {
    // Support payloads from frontend:
    // - array in `rowsToSave` or `rowToSave`
    // - single object { tanggal, keterangan }
    const payload = req.body.rowsToSave || req.body.rowToSave || req.body;

    if (Array.isArray(payload)) {
      const ids = await Promise.all(
        payload.map((r) => simpanTanggalPemutihan(r.tanggal, r.keterangan)),
      );
      return res.json({ status: "OK", ids });
    }

    const { tanggal, keterangan } = payload;
    const id = await simpanTanggalPemutihan(tanggal, keterangan);
    res.json({ status: "OK", id });
  } catch (err) {
    console.error("Error saat menyimpan tanggal pemutihan:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.delete("/api/tanggal-pemutihan/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await hapusTanggalPemutihan(id);
    if (!deleted) return res.status(404).json({ status: "NOT_FOUND" });
    res.json({ status: "OK" });
  } catch (err) {
    console.error("Error saat menghapus tanggal pemutihan:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Mengupdate pengeluaran berdasarkan id
app.put("/api/pengeluaran/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { tanggal, nominal, penanggung_jawab, keterangan, bukti_foto } = req.body;
    const updated = await updatePengeluaran(
      id,
      tanggal,
      nominal,
      penanggung_jawab,
      keterangan,
      bukti_foto
    );
    if (!updated) {
      return res.status(404).json({ status: "NOT_FOUND", message: "Pengeluaran tidak ditemukan." });
    }
    res.json({ status: "OK", message: "Pengeluaran berhasil diperbarui." });
  } catch (err) {
    console.error("Error saat memperbarui pengeluaran:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// Menghapus pengeluaran berdasarkan id
app.delete("/api/pengeluaran/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await hapusPengeluaran(id);
    if (!deleted) {
      return res.status(404).json({ status: "NOT_FOUND", message: "Pengeluaran tidak ditemukan." });
    }
    res.json({ status: "OK", message: "Pengeluaran berhasil dihapus." });
  } catch (err) {
    console.error("Error saat menghapus pengeluaran:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.get("/qr", (req, res) => {
  const qr = getLatestQr(); // PANGGIL fungsinya
  if (!qr) return res.send("Tidak ada QR. Mungkin sudah login ✅");
  res.set({
    "Content-Type": "text/html",
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
    Expires: "0",
  });
  const img = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    qr,
  )}`;
  res.send(`<h3>Scan QR WhatsApp</h3><img src="${img}" alt="qr" />`);
});

// hitung ulang nominal jimpitan harian
app.use("/api/jimpitan", hitungUlangRouter);
app.use("/api", laporanRouter);

// presensi ronda
app.use("/api/ronda", presensiRondaRouter);

// rekap saldo bulanan
app.use("/api", rekapRouter);

// Modul Keuangan Rumah Pribadi (Terpisah dari Kas Jimpitan Warga)
const keuanganRumahRouter = require("./src/features/keuangan-rumah/routes");
app.use("/api/keuangan-rumah", keuanganRumahRouter);

// System Update & Info API
const { getSystemInfo, executeSelfUpdate } = require("./src/services/systemUpdateService");

app.get("/api/system/info", async (req, res) => {
  try {
    const info = await getSystemInfo();
    res.json({ status: "OK", ...info });
  } catch (err) {
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.post("/api/system/update", async (req, res) => {
  try {
    console.log(">>> Menerima request pembaruan sistem (self-update)...");
    const result = await executeSelfUpdate();
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server berjalan di http://0.0.0.0:${PORT}`);
  console.log(`Endpoint API: http://0.0.0.0:${PORT}/api/jimpitan`);
  console.log(
    `Endpoint Laporan: http://0.0.0.0:${PORT}/api/laporan/2025-08-04`,
  );
  console.log(
    ">>> WhatsApp bot will start on-demand when first POST/WA endpoint is called",
  );
});
