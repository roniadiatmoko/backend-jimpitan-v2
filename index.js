// index.js
require("dotenv").config(); // Load environment variables from .env file
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { format, isValid, parse } = require("date-fns");

// Import fungsi dari db.js
const {
  ambilSemuaData,
  hapusDanSimpanJimpitanHarian,
  ambilLaporanHarian,
  simpanRapelHarian,
  ambilTanggalJimpitanKosong,
  ambilTanggalRapelTerisi
} = require("./db");
const {
  startBot,
  kirimTesWhatsApp,
  kirimLaporanWhatsApp,
  onBotReady,
} = require("./bailey");

const app = express();
const PORT = process.env.PORT || 3000;

console.log(">>> Memulai server...");
app.use(cors());
app.use(bodyParser.json());

// --- SECTION: ROUTES ---

app.get("/", (req, res) => {
  console.log(">>> Menerima permintaan. Server aktif.");
  res.send("Halo dari server jimpitan Replit! Server berjalan dengan baik.");
});

// Endpoint khusus untuk ping UptimeRobot
app.get("/ping", (req, res) => {
  console.log(">>> Menerima ping UptimeRobot, server tetap aktif.");
  res.status(200).send("Server is alive!");
});

// keepAlive function removed - using external UptimeRobot instead

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

let isBotStarted = false;

// Endpoint untuk menyimpan data
app.post("/api/jimpitan", async (req, res) => {
  try {
    const { secret_key, tanggal, diambil_oleh, data } = req.body;

    if (secret_key !== "rahasiakita123") {
      return res.status(401).json({ status: "UNAUTHORIZED" });
    }

    if (!Array.isArray(data)) {
      return res.status(400).json({ status: "INVALID_DATA_FORMAT" });
    }

    await hapusDanSimpanJimpitanHarian(tanggal, diambil_oleh, data);

    // Start WhatsApp bot only when needed (first POST request)
    if (!isBotStarted) {
      console.log(">>> Starting WhatsApp bot for first time...");
      startBot();
      isBotStarted = true;

      // Wait for bot to be actually ready before sending message
      onBotReady(async () => {
        console.log(">>> Bot is ready, sending WhatsApp message...");
        await kirimLaporanWhatsApp(tanggal);
      });
    } else {
      // Bot already started, send message immediately
      await kirimLaporanWhatsApp(tanggal);
    }

    res.json({ status: "OK", total: data.length });
  } catch (err) {
    console.error("Error saat menyimpan data jimpitan:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.get("/api/tes-wa", async (req, res) => {
  console.log(">>> Menerima permintaan tes WhatsApp...");
  startBot(); // Ensure bot is started
  console.log(">>> Bot is ready, sending test WhatsApp message...");
  onBotReady(async () => {
    await kirimTesWhatsApp("Test message from Jimpitan server");

  });
  res.json({ status: "OK", message: "Tes dimulai, cek whatsapp" });
});

// --- FUNGSI BARU: Endpoint untuk mengambil laporan harian berdasarkan tanggal ---
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

// --- FUNGSI BARU: Endpoint POST untuk fitur rapel ---
app.post("/api/rapel", async (req, res) => {
  try {
    const { secret_key, nomor_rumah, nominal } = req.body;

    if (secret_key !== "rahasiakita123") {
      return res.status(401).json({ status: "UNAUTHORIZED" });
    }

    const nominalPerDay = 500;
    const hariRapel = Math.floor(nominal / nominalPerDay);

    if (hariRapel <= 0) {
      return res.status(400).json({ status: "ERROR", message: "Nominal tidak mencukupi untuk 1 hari jimpitan." });
    }
    
    const bulanSekarang = moment().tz("Asia/Jakarta").format('YYYY-MM');

    // 1. Ambil daftar tanggal jimpitan yang kosong di bulan ini
    const tanggalJimpitanKosong = await ambilTanggalJimpitanKosong(nomor_rumah, bulanSekarang);
    
    // 2. Ambil daftar tanggal yang sudah dirapel di bulan ini
    const tanggalRapelTerisi = await ambilTanggalRapelTerisi(nomor_rumah, bulanSekarang);
    
    // 3. Gabungkan kedua daftar untuk menemukan hari yang benar-benar kosong
    const hariUntukDirapel = tanggalJimpitanKosong.filter(tanggal => !tanggalRapelTerisi.includes(tanggal));
    
    // 4. Batasi jumlah hari rapel sesuai nominal
    const tanggalYangDisimpan = hariUntukDirapel.slice(0, hariRapel);

    if (tanggalYangDisimpan.length === 0) {
      return res.status(404).json({ status: "NOT_FOUND", message: `Tidak ada hari jimpitan kosong untuk rumah ${nomor_rumah} di bulan ini.` });
    }
    
    // 5. Simpan setiap tanggal ke database
    const promises = tanggalYangDisimpan.map(tanggal => simpanRapelHarian(nomor_rumah, tanggal));
    await Promise.all(promises);

    res.json({ 
      status: "OK", 
      message: `Berhasil mencatat rapel ${tanggalYangDisimpan.length} hari untuk rumah ${nomor_rumah}.`,
      hariYangDisimpan: tanggalYangDisimpan
    });

  } catch (err) {
    console.error("Error saat mencatat rapel:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server berjalan di http://0.0.0.0:${PORT}`);
  console.log(`Endpoint API: http://0.0.0.0:${PORT}/api/jimpitan`);
  console.log(
    `Endpoint Laporan: http://0.0.0.0:${PORT}/api/laporan/2025-08-04`
  );
  console.log(
    ">>> WhatsApp bot will start on-demand when first POST request is received"
  );
});
