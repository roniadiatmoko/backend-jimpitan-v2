const express = require("express");
const { hitungKekurangan } = require("./controller");

const router = express.Router();

// GET /api/laporan-kekurangan/:period  -> period = 'YYYY-MM'
router.get("/laporan-kekurangan/:period", hitungKekurangan);

module.exports = router;
