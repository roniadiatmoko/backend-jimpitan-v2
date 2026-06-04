const express = require("express");
const { hitungKekurangan, hitungKekuranganTahun } = require("./controller");

const router = express.Router();

// GET /api/laporan-kekurangan/:period  -> period = 'YYYY-MM'
router.get("/laporan-kekurangan/:period", hitungKekurangan);
// GET /api/laporan-kekurangan-tahun/:year -> year = 'YYYY'
router.get("/laporan-kekurangan-tahun/:year", hitungKekuranganTahun);

module.exports = router;
