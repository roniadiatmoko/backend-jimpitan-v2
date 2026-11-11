require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('Public tables in Cloud PG:', res.rows.map(r => r.table_name));

    const hasKeuanganRumah = res.rows.some(r => r.table_name === 'keuangan_rumah');
    console.log('keuangan_rumah exists?', hasKeuanganRumah);

    if (!hasKeuanganRumah) {
      console.log('Creating table keuangan_rumah in PostgreSQL cloud...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "keuangan_rumah" (
          id SERIAL PRIMARY KEY,
          tanggal VARCHAR(20),
          jenis VARCHAR(20) DEFAULT 'pengeluaran',
          kategori VARCHAR(100),
          nominal BIGINT,
          keterangan TEXT,
          sumber_dana VARCHAR(50) DEFAULT 'Cash',
          dicatat_oleh VARCHAR(50),
          created_at VARCHAR(50)
        );
        CREATE INDEX IF NOT EXISTS idx_pg_keuangan_rumah_tgl ON "keuangan_rumah"(tanggal);
        CREATE INDEX IF NOT EXISTS idx_pg_keuangan_rumah_kategori ON "keuangan_rumah"(kategori);
      `);
      console.log('Table keuangan_rumah created successfully in Cloud PG!');
    } else {
      console.log('Table keuangan_rumah is already present in Cloud PG.');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
