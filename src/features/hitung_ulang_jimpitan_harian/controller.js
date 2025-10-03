const { getHitungUlangHarian, upsertHitungUlangHarian } = require("./model");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function hitungUlangHarian(req, res, next) {
  try {
    const { tanggal } = req.params;

    if (!DATE_RE.test(tanggal)) {
      return res.status(400).json({
        success: false,
        message: "Format tanggal tidak valid. Gunakan YYYY-MM-DD.",
      });
    }

    const result = await getHitungUlangHarian(tanggal);
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function simpanHitungUlangHarian(req, res, next) {
  try {
    const { tanggal } = req.params;
    const { nominal } = req.body; // { nominal: number }

    if (!DATE_RE.test(tanggal)) {
      return res.status(400).json({
        success: false,
        message: "Format tanggal tidak valid. Gunakan YYYY-MM-DD.",
      });
    }

    // Validasi nominal
    const num = Number(nominal);
    // if (!Number.isFinite(num) || num <= 0) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Nominal harus berupa angka > 0.",
    //   });
    // }

    const data = await upsertHitungUlangHarian(tanggal, Math.trunc(num));
    return res.json({
      success: true,
      message: "Hitung ulang harian tersimpan.",
      data, // { total_harian: ... }
    });
  } catch (err) {
    console.log(err);
  }
}

module.exports = {
  hitungUlangHarian,
  simpanHitungUlangHarian,
};
