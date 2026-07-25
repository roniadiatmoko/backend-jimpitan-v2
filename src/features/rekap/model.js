const { get, run } = require("../../db");

function getPeriodeSebelumnya(bulan, tahun) {
  let b = parseInt(bulan, 10) - 1;
  let t = parseInt(tahun, 10);

  if (b === 0) {
    b = 12;
    t -= 1;
  }

  return { bulan: String(b).padStart(2, "0"), tahun: String(t) };
}

async function getRekapByPeriode(bulan, tahun) {
  return get(`SELECT * FROM rekap WHERE bulan = ? AND tahun = ?`, [
    bulan,
    tahun,
  ]);
}

async function upsertRekap(
  bulan,
  tahun,
  pemasukan,
  pengeluaran,
  keterangan,
  is_kunci_sinkron,
) {
  const periodeSebelumnya = getPeriodeSebelumnya(bulan, tahun);
  const rekapSebelumnya = await getRekapByPeriode(
    periodeSebelumnya.bulan,
    periodeSebelumnya.tahun,
  );

  const saldo_sebelumnya = rekapSebelumnya ? rekapSebelumnya.sisa_saldo : 0;
  const sisa_saldo = saldo_sebelumnya + pemasukan - pengeluaran;

  const existing = await getRekapByPeriode(bulan, tahun);
  const kunciSinkron =
    is_kunci_sinkron === undefined
      ? existing
        ? existing.is_kunci_sinkron
        : 0
      : is_kunci_sinkron;

  if (existing) {
    await run(
      `UPDATE rekap
       SET saldo_sebelumnya = ?, pemasukan = ?, pengeluaran = ?, sisa_saldo = ?, keterangan = ?, is_kunci_sinkron = ?
       WHERE bulan = ? AND tahun = ?`,
      [
        saldo_sebelumnya,
        pemasukan,
        pengeluaran,
        sisa_saldo,
        keterangan,
        kunciSinkron,
        bulan,
        tahun,
      ],
    );
  } else {
    await run(
      `INSERT INTO rekap (bulan, tahun, saldo_sebelumnya, pemasukan, pengeluaran, sisa_saldo, keterangan, is_kunci_sinkron)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bulan,
        tahun,
        saldo_sebelumnya,
        pemasukan,
        pengeluaran,
        sisa_saldo,
        keterangan,
        kunciSinkron,
      ],
    );
  }

  return {
    bulan,
    tahun,
    saldo_sebelumnya,
    pemasukan,
    pengeluaran,
    sisa_saldo,
    keterangan,
    is_kunci_sinkron: kunciSinkron,
  };
}

module.exports = {
  getPeriodeSebelumnya,
  getRekapByPeriode,
  upsertRekap,
};
