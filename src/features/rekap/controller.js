const { getRekapByPeriode, upsertRekap } = require("./model");

const BULAN_RE = /^\d{2}$/;
const TAHUN_RE = /^\d{4}$/;
const SECRET_KEY = "rahasiakita123";

async function simpanRekap(req, res, next) {
  try {
    const {
      tahun,
      bulan,
      pemasukan,
      pengeluaran,
      keterangan,
      is_kunci_sinkron,
      secret_key,
    } = req.body;

    if (secret_key !== SECRET_KEY) {
      return res.status(401).json({
        success: false,
        message: "Secret key tidak valid.",
      });
    }

    if (!BULAN_RE.test(bulan) || !TAHUN_RE.test(tahun)) {
      return res.status(400).json({
        success: false,
        message: "Format periode tidak valid. Gunakan bulan 2 digit dan tahun 4 digit.",
      });
    }

    const nominalPemasukan = Number(pemasukan);
    const nominalPengeluaran = Number(pengeluaran);

    if (
      !Number.isFinite(nominalPemasukan) ||
      nominalPemasukan < 0 ||
      !Number.isFinite(nominalPengeluaran) ||
      nominalPengeluaran < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Pemasukan dan pengeluaran harus berupa angka >= 0.",
      });
    }

    let kunciSinkron;
    if (is_kunci_sinkron !== undefined) {
      kunciSinkron = Number(is_kunci_sinkron);
      if (kunciSinkron !== 0 && kunciSinkron !== 1) {
        return res.status(400).json({
          success: false,
          message: "is_kunci_sinkron harus bernilai 0 atau 1.",
        });
      }
    }

    const data = await upsertRekap(
      bulan,
      tahun,
      nominalPemasukan,
      nominalPengeluaran,
      keterangan || null,
      kunciSinkron,
    );

    return res.json({
      success: true,
      message: "Rekap saldo tersimpan.",
      data,
    });
  } catch (err) {
    next(err);
  }
}

async function getRekapPeriode(req, res, next) {
  try {
    const { tahun, bulan } = req.params;

    if (!BULAN_RE.test(bulan) || !TAHUN_RE.test(tahun)) {
      return res.status(400).json({
        success: false,
        message: "Format periode tidak valid. Gunakan bulan 2 digit dan tahun 4 digit.",
      });
    }

    const rekap = await getRekapByPeriode(bulan, tahun);

    return res.json({
      success: true,
      data: {
        saldo_sebelumnya: rekap ? rekap.saldo_sebelumnya : 0,
        pemasukan: rekap ? rekap.pemasukan : 0,
        pengeluaran: rekap ? rekap.pengeluaran : 0,
        sisa_saldo: rekap ? rekap.sisa_saldo : 0,
        is_kunci_sinkron: rekap ? rekap.is_kunci_sinkron : 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  simpanRekap,
  getRekapPeriode,
};
