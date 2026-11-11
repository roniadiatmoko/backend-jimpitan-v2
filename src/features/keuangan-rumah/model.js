const { db } = require("../../../db");
const { enqueueMirror } = require("../../utils/postgresMirror");

function dbAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbGet(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// 1. Simpan satu transaksi
async function insertTransaksi({
  tanggal,
  jenis = "pengeluaran",
  kategori = "Lain-lain",
  nominal = 0,
  keterangan = "",
  sumber_dana = "Cash",
  dicatat_oleh = "Pak Roni",
}) {
  const tgl =
    tanggal ||
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
      new Date()
    );
  const createdAt = new Date().toISOString();
  const numNominal = Math.abs(parseInt(nominal, 10)) || 0;

  const result = await dbRun(
    `INSERT INTO keuangan_rumah (tanggal, jenis, kategori, nominal, keterangan, sumber_dana, dicatat_oleh, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tgl, jenis, kategori, numNominal, keterangan, sumber_dana, dicatat_oleh, createdAt]
  );

  // Mirror ke Cloud PostgreSQL jika mode mirror aktif
  enqueueMirror(`keuangan_rumah insert ${result.lastID}`, (pool) => {
    return pool.query(
      `INSERT INTO "keuangan_rumah" (id, tanggal, jenis, kategori, nominal, keterangan, sumber_dana, dicatat_oleh, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [result.lastID, tgl, jenis, kategori, numNominal, keterangan, sumber_dana, dicatat_oleh, createdAt]
    );
  });

  return { id: result.lastID, tanggal: tgl, jenis, kategori, nominal: numNominal, keterangan, sumber_dana, dicatat_oleh };
}

// 2. Simpan beberapa transaksi sekaligus (batch dari WhatsApp)
async function insertBatchTransaksi(items = [], defaultDicatatOleh = "Pak Roni") {
  const results = [];
  for (const item of items) {
    const res = await insertTransaksi({
      tanggal: item.tanggal,
      jenis: item.jenis || "pengeluaran",
      kategori: item.kategori || "Kebutuhan Rumah",
      nominal: item.nominal,
      keterangan: item.keterangan,
      sumber_dana: item.sumber_dana || "Cash",
      dicatat_oleh: item.dicatat_oleh || defaultDicatatOleh,
    });
    results.push(res);
  }
  return results;
}

// 3. Ambil daftar transaksi
async function getTransaksi({ bulan, tahun, kategori, jenis, limit = 100, offset = 0 } = {}) {
  let whereClauses = [];
  let params = [];

  if (bulan) {
    const padBulan = String(bulan).padStart(2, "0");
    const y = tahun || new Date().getFullYear();
    whereClauses.push("SUBSTR(tanggal, 1, 7) = ?");
    params.push(`${y}-${padBulan}`);
  } else if (tahun) {
    whereClauses.push("SUBSTR(tanggal, 1, 4) = ?");
    params.push(String(tahun));
  }

  if (kategori) {
    whereClauses.push("kategori = ?");
    params.push(kategori);
  }

  if (jenis) {
    whereClauses.push("jenis = ?");
    params.push(jenis);
  }

  const whereStr = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
  const query = `
    SELECT * FROM keuangan_rumah
    ${whereStr}
    ORDER BY tanggal DESC, id DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  return dbAll(query, params);
}

// 4. Ambil Rekap Keuangan & Pengeluaran Terbesar
async function getRekap({ bulan, tahun } = {}) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const targetYear = tahun || currentYear;
  const targetMonth = bulan ? parseInt(bulan, 10) : currentMonth;
  const padBulan = String(targetMonth).padStart(2, "0");
  const periodeStr = `${targetYear}-${padBulan}`;

  // 1. Total Pemasukan & Pengeluaran
  const summaryRow = await dbGet(
    `SELECT
       SUM(CASE WHEN jenis = 'pengeluaran' THEN nominal ELSE 0 END) as total_pengeluaran,
       SUM(CASE WHEN jenis = 'pemasukan' THEN nominal ELSE 0 END) as total_pemasukan,
       COUNT(1) as total_transaksi
     FROM keuangan_rumah
     WHERE SUBSTR(tanggal, 1, 7) = ?`,
    [periodeStr]
  );

  const totalPengeluaran = summaryRow?.total_pengeluaran || 0;
  const totalPemasukan = summaryRow?.total_pemasukan || 0;
  const sisaSaldo = totalPemasukan - totalPengeluaran;
  const totalTransaksi = summaryRow?.total_transaksi || 0;

  // 2. Breakdown per Kategori Pengeluaran
  const kategoriRows = await dbAll(
    `SELECT
       kategori,
       SUM(nominal) as total,
       COUNT(1) as frekuensi
     FROM keuangan_rumah
     WHERE SUBSTR(tanggal, 1, 7) = ? AND jenis = 'pengeluaran'
     GROUP BY kategori
     ORDER BY total DESC`,
    [periodeStr]
  );

  const breakdownKategori = kategoriRows.map((k) => ({
    kategori: k.kategori || "Lain-lain",
    total: k.total,
    frekuensi: k.frekuensi,
    persentase: totalPengeluaran > 0 ? Math.round((k.total / totalPengeluaran) * 100) : 0,
  }));

  // 3. Pengeluaran Terbesar (Top 5 Transaksi)
  const topPengeluaran = await dbAll(
    `SELECT id, tanggal, keterangan, kategori, nominal, dicatat_oleh, sumber_dana
     FROM keuangan_rumah
     WHERE SUBSTR(tanggal, 1, 7) = ? AND jenis = 'pengeluaran'
     ORDER BY nominal DESC
     LIMIT 5`,
    [periodeStr]
  );

  // 4. Kategori Pengeluaran Terbesar
  const topKategori = breakdownKategori.length > 0 ? breakdownKategori[0] : null;

  // 5. Pencatat Kontribusi
  const dicatatOlehSummary = await dbAll(
    `SELECT dicatat_oleh, COUNT(1) as total_catat, SUM(nominal) as total_nominal
     FROM keuangan_rumah
     WHERE SUBSTR(tanggal, 1, 7) = ?
     GROUP BY dicatat_oleh`,
    [periodeStr]
  );

  return {
    periode: {
      bulan: targetMonth,
      tahun: targetYear,
      periodeStr,
    },
    totalPengeluaran,
    totalPemasukan,
    sisaSaldo,
    totalTransaksi,
    breakdownKategori,
    topPengeluaran,
    topKategori,
    dicatatOlehSummary,
  };
}

// 5. Update transaksi
async function updateTransaksi(id, { tanggal, jenis, kategori, nominal, keterangan, sumber_dana }) {
  const numNominal = Math.abs(parseInt(nominal, 10)) || 0;
  const result = await dbRun(
    `UPDATE keuangan_rumah
     SET tanggal = ?, jenis = ?, kategori = ?, nominal = ?, keterangan = ?, sumber_dana = ?
     WHERE id = ?`,
    [tanggal, jenis, kategori, numNominal, keterangan, sumber_dana, id]
  );

  enqueueMirror(`keuangan_rumah update ${id}`, (pool) => {
    return pool.query(
      `UPDATE "keuangan_rumah"
       SET tanggal = $1, jenis = $2, kategori = $3, nominal = $4, keterangan = $5, sumber_dana = $6
       WHERE id = $7`,
      [tanggal, jenis, kategori, numNominal, keterangan, sumber_dana, id]
    );
  });

  return result.changes > 0;
}

// 6. Hapus transaksi
async function deleteTransaksi(id) {
  const result = await dbRun("DELETE FROM keuangan_rumah WHERE id = ?", [id]);

  enqueueMirror(`keuangan_rumah delete ${id}`, (pool) => {
    return pool.query(`DELETE FROM "keuangan_rumah" WHERE id = $1`, [id]);
  });

  return result.changes > 0;
}

module.exports = {
  insertTransaksi,
  insertBatchTransaksi,
  getTransaksi,
  getRekap,
  updateTransaksi,
  deleteTransaksi,
};
