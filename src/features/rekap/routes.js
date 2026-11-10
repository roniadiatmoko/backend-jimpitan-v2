const express = require("express");
const { simpanRekap, getRekapPeriode, getSaldoTerkiniController } = require("./controller");

const router = express.Router();

router.get("/saldo-terkini", getSaldoTerkiniController);
router.post("/rekap", simpanRekap);
router.get("/rekap/:tahun/:bulan", getRekapPeriode);

module.exports = router;
