const { getHitungKekurangan } = require("./model");

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
};
