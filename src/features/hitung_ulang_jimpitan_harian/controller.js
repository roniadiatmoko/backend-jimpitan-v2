const { getHitungUlangHarian } = require("./model");

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

module.exports = {
  hitungUlangHarian,
};
