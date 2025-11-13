const { savePresensiRonda, getPresensiRondaByTanggal, deletePersonilById } = require("./model");

async function simpanPersonilRonda(req, res) {
  try {
    const { tanggal, homes } = req.body;

    if (!tanggal || !Array.isArray(homes)) {
      return res.status(400).json({
        success: false,
        message: "Parameter tanggal dan rumah wajib diisi.",
      });
    }

    if (homes.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Rumah tidak boleh kosong.",
      });
    }

    const result = await savePresensiRonda(tanggal, homes);

    return res.json({
      success: true,
      message: "Presensi Ronda berhasil disimpan",
      data: result,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Gagal menyimpan data presensi ronda.",
      error: err.message,
    });
  }
}

async function listPresensiRonda(req, res) {
  console.log("Mengambil data presensi ronda" + req.params.tanggal);
  try {
    const { tanggal } = req.params;

    if (!tanggal) {
      return res.status(400).json({
        success: false,
        message: "Parameter tanggal wajib diisi.",
      });
    }

    const rows = await getPresensiRondaByTanggal(tanggal);

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data presensi ronda.",
      error: err.message,
    });
  }
}

async function hapusPersonilRonda(req, res) {
  try {
    const { id } = req.params;

    await deletePersonilById(id);

    res.json({
      success: true,
      message: "Personil ronda berhasil dihapus"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Gagal menghapus personil ronda",
      error: err.message
    });
  }
}

module.exports = {
  simpanPersonilRonda,
  listPresensiRonda,
  hapusPersonilRonda
};
