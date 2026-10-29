const { get, run } = require("../../db");
const { enqueueMirror } = require("../../utils/postgresMirror");

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

  const savedRekap = await getRekapByPeriode(bulan, tahun);
  if (savedRekap) {
    enqueueMirror(`rekap ${bulan}-${tahun}`, (pool) =>
      pool.query(
        "INSERT INTO rekap (id, bulan, tahun, saldo_sebelumnya, pemasukan, pengeluaran, sisa_saldo, keterangan, is_kunci_sinkron) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO UPDATE SET bulan = EXCLUDED.bulan, tahun = EXCLUDED.tahun, saldo_sebelumnya = EXCLUDED.saldo_sebelumnya, pemasukan = EXCLUDED.pemasukan, pengeluaran = EXCLUDED.pengeluaran, sisa_saldo = EXCLUDED.sisa_saldo, keterangan = EXCLUDED.keterangan, is_kunci_sinkron = EXCLUDED.is_kunci_sinkron",
        [
          savedRekap.id,
          savedRekap.bulan,
          savedRekap.tahun,
          savedRekap.saldo_sebelumnya,
          savedRekap.pemasukan,
          savedRekap.pengeluaran,
          savedRekap.sisa_saldo,
          savedRekap.keterangan,
          savedRekap.is_kunci_sinkron,
        ],
      ),
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
