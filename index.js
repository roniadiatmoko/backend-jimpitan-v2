// index.js

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { format, isValid, parse } = require("date-fns");

// Import fungsi dari db.js
const {
  ambilSemuaData,
  hapusDanSimpanJimpitanHarian,
  ambilLaporanHarian,
} = require("./db");
const { startBot, kirimLaporanWhatsApp } = require("./bailey");

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

    // Panggil fungsi untuk mengirim laporan setelah data disimpan
    await kirimLaporanWhatsApp(tanggal);

    res.json({ status: "OK", total: data.length });
  } catch (err) {
    console.error("Error saat menyimpan data jimpitan:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// --- FUNGSI BARU: Endpoint untuk mengambil laporan harian berdasarkan tanggal ---
app.get("/api/laporan/:tanggal", async (req, res) => {
  try {
    const { tanggal } = req.params;

    // Validasi format tanggal (misal: YYYY-MM-DD)
    const parsedDate = parse(tanggal, "yyyy-MM-dd", new Date());
    if (!isValid(parsedDate)) {
      return res
        .status(400)
        .json({
          status: "ERROR",
          message: "Format tanggal tidak valid. Gunakan YYYY-MM-DD.",
        });
    }

    const laporan = await ambilLaporanHarian(tanggal);

    if (laporan.laporan.length === 0) {
      return res
        .status(404)
        .json({
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server berjalan di http://0.0.0.0:${PORT}`);
  console.log(`Endpoint API: http://0.0.0.0:${PORT}/api/jimpitan`);
  console.log(
    `Endpoint Laporan: http://0.0.0.0:${PORT}/api/laporan/2025-08-04`,
  );

  // Memulai bot WhatsApp
  startBot();
});
