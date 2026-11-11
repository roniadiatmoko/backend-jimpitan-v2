const fs = require('fs');
const path = require('path');

// 1. Update src/features/rekap/model.js
const modelPath = path.join(__dirname, '..', 'src', 'features', 'rekap', 'model.js');
let modelContent = fs.readFileSync(modelPath, 'utf8');

const getSaldoTerkiniFn = `
async function getSaldoTerkini(targetBulan) {
  const now = new Date();
  const defaultBulan = \`\${now.getFullYear()}-\${String(now.getMonth() + 1).padStart(2, "0")}\`;

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
`;

if (!modelContent.includes('getSaldoTerkini')) {
  modelContent = modelContent.replace('module.exports = {', getSaldoTerkiniFn + '\nmodule.exports = {\n  getSaldoTerkini,');
  fs.writeFileSync(modelPath, modelContent, 'utf8');
  console.log('✅ Updated model.js');
} else {
  console.log('ℹ️ model.js already has getSaldoTerkini');
}

// 2. Update src/features/rekap/controller.js
const controllerPath = path.join(__dirname, '..', 'src', 'features', 'rekap', 'controller.js');
let controllerContent = fs.readFileSync(controllerPath, 'utf8');

const controllerFn = `
async function getSaldoTerkiniController(req, res, next) {
  try {
    const { bulan } = req.query;
    const data = await getSaldoTerkini(bulan);
    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
`;

if (!controllerContent.includes('getSaldoTerkiniController')) {
  controllerContent = controllerContent.replace(
    'const { getRekapByPeriode, upsertRekap } = require("./model");',
    'const { getRekapByPeriode, upsertRekap, getSaldoTerkini } = require("./model");'
  );
  controllerContent += controllerFn + '\n';
  controllerContent = controllerContent.replace(
    'module.exports = {',
    'module.exports = {\n  getSaldoTerkiniController,'
  );
  fs.writeFileSync(controllerPath, controllerContent, 'utf8');
  console.log('✅ Updated controller.js');
} else {
  console.log('ℹ️ controller.js already has getSaldoTerkiniController');
}

// 3. Update src/features/rekap/routes.js
const routesPath = path.join(__dirname, '..', 'src', 'features', 'rekap', 'routes.js');
let routesContent = fs.readFileSync(routesPath, 'utf8');

if (!routesContent.includes('saldo-terkini')) {
  routesContent = routesContent.replace(
    'const { simpanRekap, getRekapPeriode } = require("./controller");',
    'const { simpanRekap, getRekapPeriode, getSaldoTerkiniController } = require("./controller");'
  );
  routesContent = routesContent.replace(
    'router.post("/rekap", simpanRekap);',
    'router.get("/saldo-terkini", getSaldoTerkiniController);\nrouter.post("/rekap", simpanRekap);'
  );
  fs.writeFileSync(routesPath, routesContent, 'utf8');
  console.log('✅ Updated routes.js');
} else {
  console.log('ℹ️ routes.js already has saldo-terkini');
}
