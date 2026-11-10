require('dotenv').config();
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../db.sqlite');
const sqlite = new sqlite3.Database(DB_PATH);

const PGHOST = process.env.PGHOST || "jimpitan-made-river.sage.cloud.layerbase.dev";
const PGPORT = Number(process.env.PGPORT || 5432);
const PGUSER = process.env.PGUSER || "layerbase";
const PGPASSWORD = process.env.PGPASSWORD || "xGSCAhaG6kQtq5P8na3HbS04";
const PGDATABASE = process.env.PGDATABASE || "jimpitan";

const pool = new Pool({
  host: PGHOST,
  port: PGPORT,
  user: PGUSER,
  password: PGPASSWORD,
  database: PGDATABASE,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

function getAllSqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function sync() {
  console.log(`Menghubungkan ke PostgreSQL/Layerbase (${PGHOST})...`);
  const client = await pool.connect();
  console.log('Berhasil terhubung ke PostgreSQL!');

  try {
    // 1. Ambil 68 data warga dari SQLite lokal
    const sqliteWarga = await getAllSqlite('SELECT nomor, nama, sudah_menghuni, tanggal_huni, no_hp FROM ref_warga ORDER BY CAST(nomor AS INTEGER) ASC');
    console.log(`Ditemukan ${sqliteWarga.length} data warga di SQLite.`);

    // 2. Lakukan upsert ke PostgreSQL
    console.log('Menyinkronkan seluruh 68 data warga ke PostgreSQL...');
    let successCount = 0;

    for (const w of sqliteWarga) {
      const nomor = Number(w.nomor);
      const nama = w.nama;
      const sudahMenghuni = Number(w.sudah_menghuni) === 1 ? 1 : 0;
      const tanggalHuni = w.tanggal_huni ? String(w.tanggal_huni).split('T')[0] : null;
      const noHp = w.no_hp || null;

      await client.query(`
        INSERT INTO ref_warga (nomor, nama, sudah_menghuni, tanggal_huni, no_hp)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (nomor) DO UPDATE SET
          nama = EXCLUDED.nama,
          sudah_menghuni = EXCLUDED.sudah_menghuni,
          tanggal_huni = EXCLUDED.tanggal_huni,
          no_hp = EXCLUDED.no_hp
      `, [nomor, nama, sudahMenghuni, tanggalHuni, noHp]);

      successCount++;
    }

    console.log(`✅ Berhasil menyinkronkan ${successCount} baris ref_warga ke PostgreSQL!`);

    // 3. Verifikasi total data di PostgreSQL
    const pgCountRes = await client.query('SELECT COUNT(*) as count FROM ref_warga');
    console.log(`Total baris di PostgreSQL sekarang: ${pgCountRes.rows[0].count} warga.`);

    // 4. Tampilkan sampel hasil verifikasi
    const sampleRes = await client.query(`
      SELECT nomor, nama, sudah_menghuni, tanggal_huni, no_hp 
      FROM ref_warga 
      WHERE nomor IN (1, 10, 11, 20, 35, 52, 54, 60, 63, 68)
      ORDER BY nomor ASC
    `);
    console.log('\nSampel data di PostgreSQL setelah sinkronisasi:');
    console.table(sampleRes.rows);

  } catch (err) {
    console.error('Error saat sinkronisasi:', err);
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

sync();
