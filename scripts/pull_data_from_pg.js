require('dotenv').config();
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ensure db schema is created by importing db.js or instantiating sqlite3
const DB_PATH = path.resolve(__dirname, '../db.sqlite');
const sqlite = new sqlite3.Database(DB_PATH);

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

function formatVal(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    return v.toISOString();
  }
  return v;
}

function runSqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getSqlite(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function migrate() {
  console.log('Connecting to PostgreSQL...');
  const pgClient = await pool.connect();
  console.log('Connected to PostgreSQL!');

  const tables = [
    {
      name: 'ref_warga',
      columns: ['nomor', 'nama', 'sudah_menghuni', 'tanggal_huni', 'no_hp'],
      transform: (row) => ({
        ...row,
        tanggal_huni: row.tanggal_huni instanceof Date 
          ? row.tanggal_huni.toISOString().split('T')[0] 
          : row.tanggal_huni
      })
    },
    {
      name: 'tanggal_pemutihan',
      columns: ['id', 'tanggal', 'keterangan', 'created_at'],
      transform: (row) => ({
        ...row,
        created_at: formatVal(row.created_at)
      })
    },
    {
      name: 'hitung_ulang_jimpitan_harian',
      columns: ['tanggal', 'nominal_hitung_ulang', 'created_at'],
      transform: (row) => ({
        ...row,
        created_at: formatVal(row.created_at)
      })
    },
    {
      name: 'pengeluaran',
      columns: ['id', 'tanggal', 'nominal', 'penanggung_jawab', 'keterangan', 'bukti_foto', 'created_at'],
      transform: (row) => ({
        ...row,
        tanggal: formatVal(row.tanggal),
        created_at: formatVal(row.created_at)
      })
    },
    {
      name: 'presensi_ronda',
      columns: ['id', 'tanggal', 'nomor_rumah', 'nama_penghuni', 'waktu_input'],
      transform: (row) => ({
        ...row,
        waktu_input: formatVal(row.waktu_input)
      })
    },
    {
      name: 'rapel',
      columns: ['id', 'nomor_rumah', 'tanggal'],
      transform: (row) => row
    },
    {
      name: 'rekap',
      columns: ['id', 'bulan', 'tahun', 'saldo_sebelumnya', 'pemasukan', 'pengeluaran', 'sisa_saldo', 'keterangan', 'is_kunci_sinkron'],
      transform: (row) => row
    },
    {
      name: 'jimpitan',
      columns: ['id', 'tanggal', 'nomor_rumah', 'nama_pengisi', 'jumlah', 'diambil_oleh', 'waktu_input'],
      transform: (row) => ({
        ...row,
        waktu_input: formatVal(row.waktu_input)
      })
    }
  ];

  for (const t of tables) {
    console.log(`\n--- Migrating table: ${t.name} ---`);
    const pgRes = await pgClient.query(`SELECT * FROM "${t.name}"`);
    console.log(`Fetched ${pgRes.rows.length} rows from PG.`);

    await runSqlite('BEGIN TRANSACTION');
    try {
      await runSqlite(`DELETE FROM "${t.name}"`);

      const colList = t.columns.map(c => `"${c}"`).join(', ');
      const placeholders = t.columns.map(() => '?').join(', ');
      const insertSql = `INSERT OR REPLACE INTO "${t.name}" (${colList}) VALUES (${placeholders})`;

      const stmt = sqlite.prepare(insertSql);
      
      const insertRow = (params) => {
        return new Promise((resolve, reject) => {
          stmt.run(params, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      };

      for (const rawRow of pgRes.rows) {
        const row = t.transform ? t.transform(rawRow) : rawRow;
        const values = t.columns.map(c => row[c] ?? null);
        await insertRow(values);
      }

      await new Promise((resolve, reject) => {
        stmt.finalize((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      await runSqlite('COMMIT');

      const countRes = await getSqlite(`SELECT COUNT(*) as count FROM "${t.name}"`);
      console.log(`Successfully migrated ${t.name}. SQLite now has ${countRes.count} rows.`);
    } catch (err) {
      await runSqlite('ROLLBACK');
      console.error(`Error migrating ${t.name}:`, err);
      throw err;
    }
  }

  pgClient.release();
  await pool.end();
  sqlite.close();
  console.log('\nAll data migrated successfully from PostgreSQL to SQLite!');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
