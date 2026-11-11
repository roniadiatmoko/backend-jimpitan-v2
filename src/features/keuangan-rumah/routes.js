const express = require("express");
const router = express.Router();
const {
  insertTransaksi,
  insertBatchTransaksi,
  getTransaksi,
  getRekap,
  updateTransaksi,
  deleteTransaksi,
} = require("./model");

// POST verifikasi PIN akses keuangan rumah tangga
router.post("/verify-pin", (req, res) => {
  try {
    const { pin } = req.body || {};
    const configuredPins = (process.env.KEUANGAN_RUMAH_PINS || "8055,2287,1234")
      .split(",")
      .map((p) => p.trim());
    if (pin && configuredPins.includes(String(pin).trim())) {
      return res.json({ status: "OK", valid: true });
    }
    return res.status(401).json({ status: "INVALID_PIN", message: "PIN keamanan salah." });
  } catch (err) {
    return res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// GET daftar transaksi
router.get("/", async (req, res) => {
  try {
    const { bulan, tahun, kategori, jenis, limit, offset } = req.query;
    const data = await getTransaksi({
      bulan,
      tahun,
      kategori,
      jenis,
      limit: limit ? parseInt(limit, 10) : 100,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    res.json({ status: "OK", data });
  } catch (err) {
    console.error("Error get keuangan rumah:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// GET rekap ringkasan bulanan & pengeluaran terbesar
router.get("/rekap", async (req, res) => {
  try {
    const { bulan, tahun } = req.query;
    const rekap = await getRekap({ bulan, tahun });
    res.json({ status: "OK", rekap });
  } catch (err) {
    console.error("Error get rekap keuangan rumah:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// POST tambah satu transaksi
router.post("/", async (req, res) => {
  try {
    const { tanggal, jenis, kategori, nominal, keterangan, sumber_dana, dicatat_oleh } = req.body;
    if (!nominal || isNaN(Number(nominal))) {
      return res.status(400).json({ status: "ERROR", message: "Nominal harus diisi dengan angka valid" });
    }

    const item = await insertTransaksi({
      tanggal,
      jenis,
      kategori,
      nominal,
      keterangan,
      sumber_dana,
      dicatat_oleh: dicatat_oleh || "Pak Roni",
    });

    res.json({ status: "OK", message: "Transaksi berhasil dicatat", item });
  } catch (err) {
    console.error("Error post keuangan rumah:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// POST tambah batch transaksi
router.post("/batch", async (req, res) => {
  try {
    const { items, dicatat_oleh } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: "ERROR", message: "Items transaksi tidak boleh kosong" });
    }

    const results = await insertBatchTransaksi(items, dicatat_oleh || "Pak Roni");
    res.json({ status: "OK", message: `${results.length} transaksi berhasil dicatat`, items: results });
  } catch (err) {
    console.error("Error post batch keuangan rumah:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// PUT edit transaksi
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { tanggal, jenis, kategori, nominal, keterangan, sumber_dana } = req.body;

    const success = await updateTransaksi(id, {
      tanggal,
      jenis,
      kategori,
      nominal,
      keterangan,
      sumber_dana,
    });

    if (!success) {
      return res.status(404).json({ status: "ERROR", message: "Transaksi tidak ditemukan" });
    }

    res.json({ status: "OK", message: "Transaksi berhasil diperbarui" });
  } catch (err) {
    console.error("Error put keuangan rumah:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// DELETE hapus transaksi
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const success = await deleteTransaksi(id);
    if (!success) {
      return res.status(404).json({ status: "ERROR", message: "Transaksi tidak ditemukan" });
    }
    res.json({ status: "OK", message: "Transaksi berhasil dihapus" });
  } catch (err) {
    console.error("Error delete keuangan rumah:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

module.exports = router;
