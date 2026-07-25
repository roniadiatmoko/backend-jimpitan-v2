const express = require("express");
const { simpanRekap, getRekapPeriode } = require("./controller");

const router = express.Router();

router.post("/rekap", simpanRekap);
router.get("/rekap/:tahun/:bulan", getRekapPeriode);

module.exports = router;
