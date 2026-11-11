const {
  savePresensiRonda,
  getPresensiRondaByTanggal,
  deletePersonilById,
  getJadwalRondaByHari,
  savePersonilJadwal,
  deletePersonilJadwal,
  getPresensiOrJadwalByTanggal,
} = require("./model");

async function simpanPersonilRonda(req, res) {
  try {
    const { tanggal, homes } = req.body;

    if (!tanggal || !Array.isArray(homes)) {
      return res.status(400).json({
        success: false,
        message: "Parameter tanggal dan rumah wajib diisi.",
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
  try {
    const { tanggal } = req.params;

    if (!tanggal) {
      return res.status(400).json({
        success: false,
        message: "Parameter tanggal wajib diisi.",
      });
    }

    const result = await getPresensiOrJadwalByTanggal(tanggal);

    return res.json({
      success: true,
      tanggal: result.tanggal,
      hari: result.hari,
      isSaved: result.isSaved,
      isDefaultJadwal: result.isDefaultJadwal || false,
      data: result.data || [],
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
      message: "Personil ronda berhasil dihapus",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Gagal menghapus personil ronda",
      error: err.message,
    });
  }
}

// Master Jadwal Ronda Controller
async function listJadwalRonda(req, res) {
  try {
    const { hari } = req.query;
    const rows = await getJadwalRondaByHari(hari);
    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil jadwal ronda",
      error: err.message,
    });
  }
}

async function tambahPersonilJadwal(req, res) {
  try {
    const { hari, nomor_rumah, nama_penghuni } = req.body;
    if (!hari || !nomor_rumah) {
      return res.status(400).json({
        success: false,
        message: "Hari dan nomor rumah wajib diisi.",
      });
    }

    const saved = await savePersonilJadwal({ hari, nomor_rumah, nama_penghuni });
    res.json({
      success: true,
      message: "Personil jadwal ronda berhasil ditambahkan",
      data: saved,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Gagal menyimpan personil jadwal ronda",
      error: err.message,
    });
  }
}

async function hapusPersonilJadwal(req, res) {
  try {
    const { id } = req.params;
    await deletePersonilJadwal(id);
    res.json({
      success: true,
      message: "Personil jadwal ronda berhasil dihapus",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Gagal menghapus personil jadwal ronda",
      error: err.message,
    });
  }
}

module.exports = {
  simpanPersonilRonda,
  listPresensiRonda,
  hapusPersonilRonda,
  listJadwalRonda,
  tambahPersonilJadwal,
  hapusPersonilJadwal,
};
