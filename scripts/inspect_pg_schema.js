require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
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
    const res1 = await client.query("SELECT sql FROM sqlite_master WHERE name = 'ref_warga'");
    console.log('Schema:', res1.rows);
  } catch (e) {
    console.log('Error checking sqlite_master:', e.message);
  }

  try {
    const res2 = await client.query('SELECT COUNT(*) as count FROM ref_warga');
    console.log('Count in ref_warga:', res2.rows);
    const res3 = await client.query('SELECT * FROM ref_warga LIMIT 5');
    console.log('Sample rows:', res3.rows);
  } catch (e) {
    console.log('Error querying ref_warga:', e.message);
  }

  client.release();
  await pool.end();
}
run();
