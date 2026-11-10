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


async function getSaldoTerkini(targetBulan) {
  const now = new Date();
  const defaultBulan = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const lastJimpitan = await get(
    "SELECT tanggal, MAX(waktu_input) as waktu_input FROM jimpitan WHERE jumlah > 0 GROUP BY tanggal ORDER BY tanggal DESC LIMIT 1"
  );

  const lastPengeluaran = await get(
    "SELECT tanggal, created_at FROM pengeluaran ORDER BY tanggal DESC LIMIT 1"
  );

  let tanggalTerakhir = null;
  let waktuTerakhir = null;
  let tipeTerakhir = null;

  if (lastJimpitan && lastPengeluaran) {
    const tglJimp = lastJimpitan.tanggal;
    const tglPeng = lastPengeluaran.tanggal.substring(0, 10);
    if (tglJimp >= tglPeng) {
      tanggalTerakhir = tglJimp;
      waktuTerakhir = lastJimpitan.waktu_input;
      tipeTerakhir = "jimpitan";
    } else {
      tanggalTerakhir = tglPeng;
      waktuTerakhir = lastPengeluaran.created_at || lastPengeluaran.tanggal;
      tipeTerakhir = "pengeluaran";
    }
  } else if (lastJimpitan) {
    tanggalTerakhir = lastJimpitan.tanggal;
    waktuTerakhir = lastJimpitan.waktu_input;
    tipeTerakhir = "jimpitan";
  } else if (lastPengeluaran) {
    tanggalTerakhir = lastPengeluaran.tanggal.substring(0, 10);
    waktuTerakhir = lastPengeluaran.created_at || lastPengeluaran.tanggal;
    tipeTerakhir = "pengeluaran";
  }

  const bulanOperasional =
    targetBulan ||
    (tanggalTerakhir ? tanggalTerakhir.substring(0, 7) : defaultBulan);
  const [tahun, bulanAngka] = bulanOperasional.split("-");

  const periodeSebelumnya = getPeriodeSebelumnya(bulanAngka, tahun);
  const rekapSebelumnya = await getRekapByPeriode(
    periodeSebelumnya.bulan,
    periodeSebelumnya.tahun
  );
  const saldoSebelumnya = rekapSebelumnya
    ? Number(rekapSebelumnya.sisa_saldo)
    : 0;

  const jimpitanRow = await get(
    "SELECT count(1) * 500 as total FROM jimpitan WHERE SUBSTR(tanggal, 1, 7) = ? AND jumlah > 0",
    [bulanOperasional]
  );
  const totalJimpitan = jimpitanRow ? Number(jimpitanRow.total) : 0;

  const rapelRow = await get(
    "SELECT count(1) * 500 as total FROM rapel WHERE SUBSTR(tanggal, 1, 7) = ?",
    [bulanOperasional]
  );
  const totalRapel = rapelRow ? Number(rapelRow.total) : 0;

  const pengeluaranRow = await get(
    "SELECT SUM(nominal) as total FROM pengeluaran WHERE SUBSTR(tanggal, 1, 7) = ?",
    [bulanOperasional]
  );
  const totalPengeluaran =
    pengeluaranRow && pengeluaranRow.total ? Number(pengeluaranRow.total) : 0;

  const totalPemasukan = totalJimpitan + totalRapel;
  const sisaSaldo = saldoSebelumnya + totalPemasukan - totalPengeluaran;

  return {
    sisa_saldo: sisaSaldo,
    saldo_sebelumnya: saldoSebelumnya,
    pemasukan_bulan_ini: totalPemasukan,
    total_jimpitan: totalJimpitan,
    total_rapel: totalRapel,
    pengeluaran_bulan_ini: totalPengeluaran,
    bulan: bulanOperasional,
    tanggal_terakhir_diupdate: tanggalTerakhir,
    waktu_terakhir_diupdate: waktuTerakhir,
    tipe_update_terakhir: tipeTerakhir,
  };
}

module.exports = {
  getSaldoTerkini,
  getPeriodeSebelumnya,
  getRekapByPeriode,
  upsertRekap,
};
