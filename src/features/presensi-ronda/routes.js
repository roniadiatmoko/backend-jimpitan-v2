const express = require("express");
const {
  simpanPersonilRonda,
  listPresensiRonda,
  hapusPersonilRonda,
  listJadwalRonda,
  tambahPersonilJadwal,
  hapusPersonilJadwal,
} = require("./controller");

const router = express.Router();

// Presensi Ronda Harian
router.post("/personil", simpanPersonilRonda);
router.get("/personil/:tanggal", listPresensiRonda);
router.delete("/personil/:id", hapusPersonilRonda);

// Master Jadwal Ronda Mingguan
router.get("/jadwal", listJadwalRonda);
router.post("/jadwal", tambahPersonilJadwal);
router.delete("/jadwal/:id", hapusPersonilJadwal);

module.exports = router;
