const { getHitungKekurangan, getHitungKekuranganTahun } = require("./model");

function isValidPeriod(period) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

async function hitungKekurangan(req, res, next) {
  try {
    const { period } = req.params;

    if (!isValidPeriod(period)) {
      return res.status(400).json({
        ok: false,
        message: "Param 'period' harus format YYYY-MM, contoh: 2025-08",
      });
    }

    const data = await getHitungKekurangan(period);
    return res.json({
      ok: true,
      period,
      data,
    });
  } catch (err) {
    console.error("[hitungKekurangan] ERROR:", err);
    return res.status(500).json({
      ok: false,
      message: "Terjadi kesalahan saat menghitung kekurangan",
      error: String(err),
    });
  }
}

module.exports = {
  hitungKekurangan,
  hitungKekuranganTahun,
};

function isValidYear(year) {
  return /^\d{4}$/.test(String(year));
}

async function hitungKekuranganTahun(req, res, next) {
  try {
    const { year } = req.params;

    if (!isValidYear(year)) {
      return res.status(400).json({ ok: false, message: "Param 'year' harus format YYYY, contoh: 2025" });
    }

    const data = await getHitungKekuranganTahun(year);
    return res.json({ ok: true, year, data });
  } catch (err) {
    console.error("[hitungKekuranganTahun] ERROR:", err);
    return res.status(500).json({ ok: false, message: "Terjadi kesalahan saat menghitung kekurangan tahun", error: String(err) });
  }
}
