const express = require("express");
const { hitungUlangHarian } = require("./controller");

const router = express.Router();

router.get("/hitung-ulang-harian/:tanggal", hitungUlangHarian);

module.exports = router;
