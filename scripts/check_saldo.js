const { get, all } = require('../src/db');
const { getPeriodeSebelumnya, getRekapByPeriode } = require('../src/features/rekap/model');

async function getSaldoTerkini(targetBulan) {
  // Jika targetBulan tidak ditentukan, gunakan bulan dari transaksi jimpitan/pengeluaran terakhir atau tanggal hari ini
  let now = new Date();
  let defaultBulan = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Cek transaksi jimpitan terakhir
  const lastJimpitan = await get(
    "SELECT tanggal, MAX(waktu_input) as waktu_input FROM jimpitan WHERE jumlah > 0 GROUP BY tanggal ORDER BY tanggal DESC LIMIT 1"
  );
  
  // Cek transaksi pengeluaran terakhir
  const lastPengeluaran = await get(
    "SELECT tanggal, created_at FROM pengeluaran ORDER BY tanggal DESC LIMIT 1"
  );

  // Tentukan tanggal terakhir diupdate
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

  // Gunakan bulan dari transaksi terakhir jika ada, atau bulan saat ini
  const bulanOperasional = targetBulan || (tanggalTerakhir ? tanggalTerakhir.substring(0, 7) : defaultBulan);
  const [tahun, bulanAngka] = bulanOperasional.split('-');

  // 1. Saldo sebelumnya (dari bulan lalu)
  const periodeSebelumnya = getPeriodeSebelumnya(bulanAngka, tahun);
  const rekapSebelumnya = await getRekapByPeriode(periodeSebelumnya.bulan, periodeSebelumnya.tahun);
  const saldoSebelumnya = rekapSebelumnya ? Number(rekapSebelumnya.sisa_saldo) : 0;

  // 2. Pemasukan jimpitan harian bulan ini
  const jimpitanRow = await get(
    "SELECT count(1) * 500 as total FROM jimpitan WHERE SUBSTR(tanggal, 1, 7) = ? AND jumlah > 0",
    [bulanOperasional]
  );
  const totalJimpitan = jimpitanRow ? Number(jimpitanRow.total) : 0;

  // 3. Pemasukan rapel bulan ini
  const rapelRow = await get(
    "SELECT count(1) * 500 as total FROM rapel WHERE SUBSTR(tanggal, 1, 7) = ?",
    [bulanOperasional]
  );
  const totalRapel = rapelRow ? Number(rapelRow.total) : 0;

  // 4. Pengeluaran bulan ini
  const pengeluaranRow = await get(
    "SELECT SUM(nominal) as total FROM pengeluaran WHERE SUBSTR(tanggal, 1, 7) = ?",
    [bulanOperasional]
  );
  const totalPengeluaran = pengeluaranRow && pengeluaranRow.total ? Number(pengeluaranRow.total) : 0;

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

(async () => {
  const res = await getSaldoTerkini();
  console.log("Saldo Terkini Result:", res);
})();
