const express = require("express");
const { hitungUlangHarian, simpanHitungUlangHarian } = require("./controller");

const router = express.Router();

router.get("/hitung-ulang-harian/:tanggal", hitungUlangHarian);
router.post("/hitung-ulang-harian/:tanggal", simpanHitungUlangHarian);

module.exports = router;
