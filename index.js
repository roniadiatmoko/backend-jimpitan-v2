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

// Import fungsi dari db.js
const {
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
  simpanPengeluaran,
  hapusPengeluaran,
  simpanTanggalPemutihan,
  ambilTanggalPemutihan,
  hapusTanggalPemutihan,
} = require("./db");

const {
  startBot,
  kirimTesWhatsApp,
  kirimLaporanWhatsApp,
  resendLaporanWhatsApp,
  getLatestQr,
  onBotReady,
} = require("./bailey"); // pastikan nama file sesuai

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
    const { secret_key, tanggal, diambil_oleh, data } = req.body;

    if (secret_key !== "rahasiakita123") {
      return res.status(401).json({ status: "UNAUTHORIZED" });
    }

    if (!Array.isArray(data)) {
      return res.status(400).json({ status: "INVALID_DATA_FORMAT" });
    }

    await hapusDanSimpanJimpitanHarian(tanggal, diambil_oleh, data);

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

    if (secret_key !== "rahasiakita123") {
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

    // 3. Gabungkan kedua daftar untuk menemukan hari yang benar-benar kosong
    const hariUntukDirapel = tanggalJimpitanKosong.filter(
      (tanggal) => !tanggalRapelTerisi.includes(tanggal),
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
    const { tanggal, keterangan } = req.body;
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
