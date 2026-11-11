const fs = require("fs");
const { Pool } = require("pg");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.resolve(__dirname, "../../db.sqlite");
const ENV_PATH = path.resolve(__dirname, "../../.env");

function formatVal(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    return v.toISOString();
  }
  return v;
}

function getSqliteDb() {
  return new sqlite3.Database(DB_PATH);
}

function runSqlite(sqlite, sql, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getSqlite(sqlite, sql, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getPgPool() {
  if (
    !process.env.PGHOST ||
    !process.env.PGUSER ||
    !process.env.PGPASSWORD ||
    !process.env.PGDATABASE
  ) {
    throw new Error(
      "Kredensial PostgreSQL belum lengkap di .env (PGHOST, PGUSER, PGPASSWORD, PGDATABASE)",
    );
  }
  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 35000,
  });
  pool.on("error", (err) => {
    console.warn("[cloudSyncService] PG pool background error:", err.message);
  });
  return pool;
}

/**
 * Daftar tabel tersinkronisasi lengkap dengan skema pembuatan otomatis (CREATE TABLE IF NOT EXISTS) di PostgreSQL Cloud.
 * Jika tabel belum ada di cloud saat proses sinkronisasi berjalan, sistem akan membuatnya secara otomatis.
 */
const SYNC_TABLES = [
  {
    name: "ref_warga",
    createSql: `
      CREATE TABLE IF NOT EXISTS "ref_warga" (
        nomor INTEGER PRIMARY KEY,
        nama TEXT,
        sudah_menghuni INTEGER,
        tanggal_huni DATE,
        no_hp TEXT
      );
    `,
    columns: ["nomor", "nama", "sudah_menghuni", "tanggal_huni", "no_hp"],
    transform: (row) => ({
      ...row,
      tanggal_huni:
        row.tanggal_huni instanceof Date
          ? row.tanggal_huni.toISOString().split("T")[0]
          : row.tanggal_huni,
    }),
  },
  {
    name: "tanggal_pemutihan",
    createSql: `
      CREATE TABLE IF NOT EXISTS "tanggal_pemutihan" (
        id SERIAL PRIMARY KEY,
        tanggal VARCHAR(50),
        keterangan TEXT,
        created_at VARCHAR(100)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tanggal_pemutihan_tanggal ON "tanggal_pemutihan"(tanggal);
    `,
    columns: ["id", "tanggal", "keterangan", "created_at"],
    transform: (row) => ({
      ...row,
      created_at: formatVal(row.created_at),
    }),
  },
  {
    name: "hitung_ulang_jimpitan_harian",
    createSql: `
      CREATE TABLE IF NOT EXISTS "hitung_ulang_jimpitan_harian" (
        tanggal VARCHAR(50) PRIMARY KEY,
        nominal_hitung_ulang VARCHAR(100),
        created_at VARCHAR(100)
      );
    `,
    columns: ["tanggal", "nominal_hitung_ulang", "created_at"],
    transform: (row) => ({
      ...row,
      created_at: formatVal(row.created_at),
    }),
  },
  {
    name: "pengeluaran",
    createSql: `
      CREATE TABLE IF NOT EXISTS "pengeluaran" (
        id SERIAL PRIMARY KEY,
        tanggal VARCHAR(50),
        nominal VARCHAR(100),
        penanggung_jawab VARCHAR(255),
        keterangan TEXT,
        bukti_foto TEXT,
        created_at VARCHAR(100)
      );
    `,
    columns: [
      "id",
      "tanggal",
      "nominal",
      "penanggung_jawab",
      "keterangan",
      "bukti_foto",
      "created_at",
    ],
    transform: (row) => ({
      ...row,
      tanggal: formatVal(row.tanggal),
      created_at: formatVal(row.created_at),
    }),
  },
  {
    name: "presensi_ronda",
    createSql: `
      CREATE TABLE IF NOT EXISTS "presensi_ronda" (
        id SERIAL PRIMARY KEY,
        tanggal VARCHAR(50),
        nomor_rumah VARCHAR(50),
        nama_penghuni VARCHAR(255),
        waktu_input VARCHAR(100)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_presensi_ronda_unique ON "presensi_ronda"(tanggal, nomor_rumah);
    `,
    columns: ["id", "tanggal", "nomor_rumah", "nama_penghuni", "waktu_input"],
    transform: (row) => ({
      ...row,
      waktu_input: formatVal(row.waktu_input),
    }),
  },
  {
    name: "rapel",
    createSql: `
      CREATE TABLE IF NOT EXISTS "rapel" (
        id SERIAL PRIMARY KEY,
        nomor_rumah VARCHAR(50),
        tanggal VARCHAR(50)
      );
    `,
    columns: ["id", "nomor_rumah", "tanggal"],
    transform: (row) => row,
  },
  {
    name: "rekap",
    createSql: `
      CREATE TABLE IF NOT EXISTS "rekap" (
        id SERIAL PRIMARY KEY,
        bulan VARCHAR(20),
        tahun VARCHAR(10),
        saldo_sebelumnya NUMERIC,
        pemasukan NUMERIC,
        pengeluaran NUMERIC,
        sisa_saldo NUMERIC,
        keterangan TEXT,
        is_kunci_sinkron INTEGER DEFAULT 0
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_rekap_periode ON "rekap"(bulan, tahun);
    `,
    columns: [
      "id",
      "bulan",
      "tahun",
      "saldo_sebelumnya",
      "pemasukan",
      "pengeluaran",
      "sisa_saldo",
      "keterangan",
      "is_kunci_sinkron",
    ],
    transform: (row) => row,
  },
  {
    name: "jimpitan",
    createSql: `
      CREATE TABLE IF NOT EXISTS "jimpitan" (
        id SERIAL PRIMARY KEY,
        tanggal VARCHAR(50),
        nomor_rumah VARCHAR(50),
        nama_pengisi VARCHAR(255),
        jumlah BIGINT,
        diambil_oleh VARCHAR(255),
        waktu_input VARCHAR(100)
      );
    `,
    columns: [
      "id",
      "tanggal",
      "nomor_rumah",
      "nama_pengisi",
      "jumlah",
      "diambil_oleh",
      "waktu_input",
    ],
    transform: (row) => ({
      ...row,
      waktu_input: formatVal(row.waktu_input),
    }),
  },
  {
    name: "keuangan_rumah",
    createSql: `
      CREATE TABLE IF NOT EXISTS "keuangan_rumah" (
        id SERIAL PRIMARY KEY,
        tanggal VARCHAR(50),
        jenis VARCHAR(20) DEFAULT 'pengeluaran',
        kategori VARCHAR(100),
        nominal BIGINT,
        keterangan TEXT,
        sumber_dana VARCHAR(50) DEFAULT 'Cash',
        dicatat_oleh VARCHAR(50),
        created_at VARCHAR(100)
      );
      CREATE INDEX IF NOT EXISTS idx_keuangan_rumah_tgl ON "keuangan_rumah"(tanggal);
      CREATE INDEX IF NOT EXISTS idx_keuangan_rumah_kategori ON "keuangan_rumah"(kategori);
    `,
    columns: [
      "id",
      "tanggal",
      "jenis",
      "kategori",
      "nominal",
      "keterangan",
      "sumber_dana",
      "dicatat_oleh",
      "created_at",
    ],
    transform: (row) => ({
      ...row,
      tanggal:
        row.tanggal instanceof Date
          ? row.tanggal.toISOString().split("T")[0]
          : row.tanggal,
      created_at: formatVal(row.created_at),
    }),
  },
  {
    name: "users",
    createSql: `
      CREATE TABLE IF NOT EXISTS "users" (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        fullname VARCHAR(200),
        role VARCHAR(50) DEFAULT 'admin',
        created_at VARCHAR(100),
        updated_at VARCHAR(100)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON "users"(username);
    `,
    columns: [
      "id",
      "username",
      "password_hash",
      "fullname",
      "role",
      "created_at",
      "updated_at",
    ],
    transform: (row) => ({
      ...row,
      created_at: formatVal(row.created_at),
      updated_at: formatVal(row.updated_at),
    }),
  },
  {
    name: "jadwal_petugas_ronda",
    createSql: `
      CREATE TABLE IF NOT EXISTS "jadwal_petugas_ronda" (
        id SERIAL PRIMARY KEY,
        hari VARCHAR(20) NOT NULL,
        nomor_rumah VARCHAR(50) NOT NULL,
        nama_penghuni VARCHAR(255),
        created_at VARCHAR(100) DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(hari, nomor_rumah)
      );
      CREATE INDEX IF NOT EXISTS idx_jadwal_ronda_hari ON "jadwal_petugas_ronda"(hari);
    `,
    columns: ["id", "hari", "nomor_rumah", "nama_penghuni", "created_at"],
    transform: (row) => ({
      ...row,
      created_at: formatVal(row.created_at),
    }),
  },
];

/**
 * Eksekutor query multi-statement untuk PostgreSQL
 */
async function executeSqlStatements(pgClient, sqlText) {
  if (!sqlText) return;
  const statements = sqlText
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await pgClient.query(stmt);
    } catch (stmtErr) {
      // Abaikan duplicate index atau info benign, laporkan error penting
      if (!/already exists/i.test(stmtErr.message)) {
        console.warn(`[cloudSyncService] Perhatian saat eksekusi DDL Cloud: ${stmtErr.message}`);
      }
    }
  }
}

/**
 * Otomatis memastikan seluruh tabel yang ada di aplikasi lokal dibuatkan di Cloud PostgreSQL jika belum ada.
 */
async function ensureCloudTablesExist(pgClient) {
  for (const t of SYNC_TABLES) {
    if (t.createSql) {
      await executeSqlStatements(pgClient, t.createSql);
    }
  }
}

/**
 * Insert data dalam batch / chunk untuk performa tinggi dan menghindari koneksi timeout
 */
async function batchInsertPg(pgClient, tableName, columns, rows, batchSize = 250) {
  if (!rows || rows.length === 0) return;

  const colList = columns.map((c) => `"${c}"`).join(", ");

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const valuePlaceholders = [];
    const flatValues = [];

    chunk.forEach((row, rowIdx) => {
      const rowPlaceholders = [];
      columns.forEach((col, colIdx) => {
        const paramIndex = rowIdx * columns.length + colIdx + 1;
        rowPlaceholders.push(`$${paramIndex}`);
        flatValues.push(row[col] ?? null);
      });
      valuePlaceholders.push(`(${rowPlaceholders.join(", ")})`);
    });

    const insertSql = `INSERT INTO "${tableName}" (${colList}) VALUES ${valuePlaceholders.join(", ")}`;
    await pgClient.query(insertSql, flatValues);
  }
}

/**
 * Preview perbandingan data antara PostgreSQL Cloud dan SQLite Lokal
 * Menghitung selisih hari & proteksi agar Cloud yang tertinggal tidak menimpa data lokal yang lebih baru
 */
async function getPreviewStatus() {
  let pool;
  let pgClient;
  let sqlite;

  try {
    pool = getPgPool();
    sqlite = getSqliteDb();

    pgClient = await pool.connect();
    pgClient.on("error", (err) => {
      console.warn("[cloudSyncService] PG preview client warning:", err.message);
    });

    // 0. Pastikan semua tabel di Cloud sudah ada sehingga query tidak error jika ada tabel baru
    await ensureCloudTablesExist(pgClient);

    // 1. Query Cloud PostgreSQL
    const pgJimpitan = await pgClient.query(
      'SELECT MAX(tanggal) as max_tanggal, COUNT(*) as cnt FROM "jimpitan"',
    );
    const pgWarga = await pgClient.query('SELECT COUNT(*) as cnt FROM "ref_warga"');

    const cloudMaxTanggal = pgJimpitan.rows[0]?.max_tanggal || null;
    const cloudTotalJimpitan = Number(pgJimpitan.rows[0]?.cnt || 0);
    const cloudTotalWarga = Number(pgWarga.rows[0]?.cnt || 0);

    // 2. Query SQLite Lokal
    const localJimpitan = await getSqlite(
      sqlite,
      'SELECT MAX(tanggal) as max_tanggal, COUNT(*) as cnt FROM "jimpitan"',
    );
    const localWarga = await getSqlite(
      sqlite,
      'SELECT COUNT(*) as cnt FROM "ref_warga"',
    );

    const localMaxTanggal = localJimpitan?.max_tanggal || null;
    const localTotalJimpitan = Number(localJimpitan?.cnt || 0);
    const localTotalWarga = Number(localWarga?.cnt || 0);

    // 3. Deteksi apakah data lokal tertinggal dari Cloud (missingDates in Local)
    let missingDates = [];
    if (cloudMaxTanggal) {
      if (localMaxTanggal) {
        const missingRes = await pgClient.query(
          'SELECT DISTINCT tanggal FROM "jimpitan" WHERE tanggal > $1 ORDER BY tanggal ASC',
          [localMaxTanggal],
        );
        missingDates = missingRes.rows.map((r) => r.tanggal);
      } else {
        const missingRes = await pgClient.query(
          'SELECT DISTINCT tanggal FROM "jimpitan" ORDER BY tanggal DESC LIMIT 15',
        );
        missingDates = missingRes.rows.map((r) => r.tanggal).reverse();
      }
    }

    const daysBehind = missingDates.length;

    // 4. Deteksi apakah data Cloud tertinggal dari Lokal (missingDates in Cloud / Local is AHEAD)
    let localAheadDates = [];
    if (localMaxTanggal) {
      if (cloudMaxTanggal) {
        const aheadRows = await new Promise((res, rej) => {
          sqlite.all(
            'SELECT DISTINCT tanggal FROM "jimpitan" WHERE tanggal > ? ORDER BY tanggal ASC',
            [cloudMaxTanggal],
            (err, rows) => (err ? rej(err) : res(rows || []))
          );
        });
        localAheadDates = aheadRows.map((r) => r.tanggal);
      } else {
        const aheadRows = await new Promise((res, rej) => {
          sqlite.all(
            'SELECT DISTINCT tanggal FROM "jimpitan" ORDER BY tanggal DESC LIMIT 15',
            [],
            (err, rows) => (err ? rej(err) : res(rows || []))
          );
        });
        localAheadDates = aheadRows.map((r) => r.tanggal).reverse();
      }
    }

    let daysAhead = localAheadDates.length;
    if (daysAhead === 0 && localMaxTanggal && cloudMaxTanggal && localMaxTanggal > cloudMaxTanggal) {
      const d1 = new Date(cloudMaxTanggal + "T00:00:00");
      const d2 = new Date(localMaxTanggal + "T00:00:00");
      daysAhead = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
    }

    let calendarDaysDiff = 0;
    if (cloudMaxTanggal && localMaxTanggal) {
      const d1 = new Date(localMaxTanggal + "T00:00:00");
      const d2 = new Date(cloudMaxTanggal + "T00:00:00");
      calendarDaysDiff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    }

    // Tentukan Status Sinkronisasi & Izin Tarik / Unggah
    let status = "UP_TO_DATE";
    let isLocalAhead = false;
    let canPull = true;
    let canPush = true;
    let message = "Data lokal sudah sama persis dengan data Cloud.";

    if (daysAhead > 0 || (localMaxTanggal && cloudMaxTanggal && localMaxTanggal > cloudMaxTanggal)) {
      status = "AHEAD";
      isLocalAhead = true;
      canPull = true;
      canPush = true;
      message = `Database lokal lebih baru dibanding Cloud (${daysAhead} hari). Tarik dari Cloud untuk membersihkan sisa data uji coba, atau Unggah ke Cloud jika data lokal adalah data ronda asli.`;
    } else if (daysBehind > 0 || (cloudMaxTanggal && localMaxTanggal && cloudMaxTanggal > localMaxTanggal)) {
      status = "BEHIND";
      isLocalAhead = false;
      canPull = true;
      canPush = true;
      message = `Data lokal tertinggal ${daysBehind} hari inputan ronda (tanggal terakhir di cloud: ${cloudMaxTanggal}, lokal: ${localMaxTanggal || "belum ada"}).`;
    }

    return {
      connected: true,
      status,
      is_local_ahead: isLocalAhead,
      can_pull: canPull,
      can_push: canPush,
      message,
      days_behind: daysBehind,
      days_ahead: daysAhead,
      calendar_days_diff: calendarDaysDiff,
      missing_dates: missingDates,
      local_ahead_dates: localAheadDates,
      cloud: {
        max_tanggal: cloudMaxTanggal,
        total_jimpitan: cloudTotalJimpitan,
        total_warga: cloudTotalWarga,
      },
      local: {
        max_tanggal: localMaxTanggal,
        total_jimpitan: localTotalJimpitan,
        total_warga: localTotalWarga,
      },
      checked_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[cloudSyncService] Preview error:", err.message);
    return {
      connected: false,
      status: "ERROR",
      is_local_ahead: false,
      can_pull: false,
      can_push: false,
      message: "Gagal terhubung ke Cloud PostgreSQL: " + err.message,
      error: err.message,
      checked_at: new Date().toISOString(),
    };
  } finally {
    if (pgClient) pgClient.release();
    if (pool) await pool.end().catch(() => {});
    if (sqlite) sqlite.close();
  }
}

/**
 * Menarik seluruh tabel data dari PostgreSQL Cloud ke SQLite Lokal
 * Dilengkapi proteksi agar tidak bisa menarik jika data Cloud lebih tua/tertinggal
 */
async function executeFullPull(force = false) {
  // Proteksi pencegahan kehilangan data
  if (!force) {
    const preview = await getPreviewStatus();
    if (preview.connected && preview.is_local_ahead) {
      throw new Error(
        `Proteksi Kehilangan Data: Database Cloud tertinggal ${preview.days_ahead} hari dari database lokal (${preview.local.max_tanggal} vs Cloud ${preview.cloud.max_tanggal}). Penarikan data dari Cloud dibatalkan agar data lokal yang lebih baru tidak terhapus!`
      );
    }
  }

  let pool;
  let pgClient;
  let sqlite;
  const migratedSummary = {};

  try {
    pool = getPgPool();
    sqlite = getSqliteDb();

    console.log("[cloudSyncService] Connecting to PostgreSQL for full pull...");
    pgClient = await pool.connect();
    pgClient.on("error", (err) => {
      console.warn("[cloudSyncService] PG pull client warning:", err.message);
    });
    console.log("[cloudSyncService] PostgreSQL connected!");

    // Otomatis pastikan semua tabel sudah terbuat di Cloud
    await ensureCloudTablesExist(pgClient);

    for (const t of SYNC_TABLES) {
      console.log(`[cloudSyncService] Migrating table: ${t.name}...`);
      const pgRes = await pgClient.query(`SELECT * FROM "${t.name}"`);

      await runSqlite(sqlite, "BEGIN TRANSACTION");
      try {
        await runSqlite(sqlite, `DELETE FROM "${t.name}"`);

        const colList = t.columns.map((c) => `"${c}"`).join(", ");
        const placeholders = t.columns.map(() => "?").join(", ");
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
          const values = t.columns.map((c) => row[c] ?? null);
          await insertRow(values);
        }

        await new Promise((resolve, reject) => {
          stmt.finalize((err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        await runSqlite(sqlite, "COMMIT");

        migratedSummary[t.name] = pgRes.rows.length;
        console.log(
          `[cloudSyncService] ${t.name} migrated: ${pgRes.rows.length} rows.`,
        );
      } catch (tableErr) {
        await runSqlite(sqlite, "ROLLBACK");
        throw tableErr;
      }
    }

    return {
      status: "OK",
      message:
        "Semua data berhasil ditarik dan disinkronkan dari Cloud PostgreSQL ke SQLite lokal.",
      tables: migratedSummary,
      synced_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[cloudSyncService] Full pull error:", err);
    throw err;
  } finally {
    if (pgClient) pgClient.release();
    if (pool) await pool.end().catch(() => {});
    if (sqlite) sqlite.close();
  }
}

/**
 * Mengunggah seluruh tabel data dari SQLite Lokal ke PostgreSQL Cloud
 * Dipakai saat data lokal lebih baru daripada Cloud (misal setelah ronda offline)
 */
async function executeFullPush() {
  let pool;
  let pgClient;
  let sqlite;
  const pushedSummary = {};

  try {
    pool = getPgPool();
    sqlite = getSqliteDb();

    console.log("[cloudSyncService] Menghubungkan ke PostgreSQL untuk full push...");
    pgClient = await pool.connect();
    pgClient.on("error", (err) => {
      console.warn("[cloudSyncService] PG push client warning:", err.message);
    });
    console.log("[cloudSyncService] PostgreSQL connected!");

    // Otomatis pastikan semua tabel sudah terbuat di Cloud PostgreSQL
    await ensureCloudTablesExist(pgClient);

    await pgClient.query("BEGIN");

    for (const t of SYNC_TABLES) {
      console.log(`[cloudSyncService] Mengunggah tabel ${t.name} ke Cloud...`);
      const sqliteRows = await new Promise((res, rej) => {
        sqlite.all(`SELECT * FROM "${t.name}"`, [], (err, rows) => {
          if (err) rej(err);
          else res(rows || []);
        });
      });

      // Kosongkan tabel di PG lalu isi dengan seluruh data lokal
      await pgClient.query(`DELETE FROM "${t.name}"`);

      if (sqliteRows.length > 0) {
        const rowsToInsert = t.transformPush
          ? sqliteRows.map((r) => t.transformPush(r))
          : sqliteRows;
        await batchInsertPg(pgClient, t.name, t.columns, rowsToInsert, 250);

        // Sinkronkan sequence ID untuk tabel yang memiliki serial sequence
        if (t.columns.includes("id")) {
          try {
            await pgClient.query(
              `SELECT setval(pg_get_serial_sequence('"${t.name}"', 'id'), COALESCE((SELECT MAX(id) FROM "${t.name}"), 1))`
            );
          } catch (seqErr) {
            // Sequence mungkin tidak ada jika bukan SERIAL PK
          }
        }
      }

      pushedSummary[t.name] = sqliteRows.length;
      console.log(`[cloudSyncService] ${t.name} berhasil diunggah: ${sqliteRows.length} baris.`);
    }

    await pgClient.query("COMMIT");

    return {
      status: "OK",
      message: "Semua data lokal berhasil diunggah dan disinkronkan ke Cloud PostgreSQL.",
      tables: pushedSummary,
      synced_at: new Date().toISOString(),
    };
  } catch (err) {
    if (pgClient) {
      await pgClient.query("ROLLBACK").catch(() => {});
    }
    console.error("[cloudSyncService] Full push error:", err);
    throw err;
  } finally {
    if (pgClient) pgClient.release();
    if (pool) await pool.end().catch(() => {});
    if (sqlite) sqlite.close();
  }
}

function getAppMode() {
  const isProd =
    (process.env.ENV === "prod" || process.env.ENV === "production") &&
    process.env.ENABLE_PG_MIRROR === "true";
  const mode = isProd ? "prod" : "dev";
  const { getActiveGroupId } = require("../../bailey");
  const activeGroup = getActiveGroupId
    ? getActiveGroupId()
    : isProd
      ? process.env.GROUP_ID
      : process.env.GROUP_ID_TESTING;

  return {
    mode,
    is_prod: isProd,
    enable_pg_mirror: process.env.ENABLE_PG_MIRROR === "true",
    env: process.env.ENV,
    active_group_id: activeGroup,
    target_group_label: isProd
      ? "Grup Utama Warga (PROD)"
      : "Grup Testing (DEV)",
  };
}

async function switchAppMode(targetMode, pullFirst = true) {
  const toProd = targetMode === "prod" || targetMode === "production";
  let syncActionResult = null;

  if (toProd && pullFirst) {
    const preview = await getPreviewStatus();
    if (preview.connected) {
      console.log(
        "[cloudSyncService] Beralih ke PROD: Menarik seluruh data resmi dari Cloud PostgreSQL untuk membersihkan data uji coba lokal...",
      );
      syncActionResult = await executeFullPull(true);
    }
  }

  // Set environment variables in-memory
  process.env.ENV = toProd ? "prod" : "dev";
  process.env.ENABLE_PG_MIRROR = toProd ? "true" : "false";

  // Persist perubahan ke file .env
  try {
    if (fs.existsSync(ENV_PATH)) {
      let content = fs.readFileSync(ENV_PATH, "utf8");

      if (/^ENV=.*$/m.test(content)) {
        content = content.replace(/^ENV=.*$/m, `ENV="${process.env.ENV}"`);
      } else {
        content += `\nENV="${process.env.ENV}"`;
      }

      if (/^ENABLE_PG_MIRROR=.*$/m.test(content)) {
        content = content.replace(
          /^ENABLE_PG_MIRROR=.*$/m,
          `ENABLE_PG_MIRROR="${process.env.ENABLE_PG_MIRROR}"`,
        );
      } else {
        content += `\nENABLE_PG_MIRROR="${process.env.ENABLE_PG_MIRROR}"`;
      }

      fs.writeFileSync(ENV_PATH, content, "utf8");
      console.log(
        `[cloudSyncService] File .env diperbarui: ENV=${process.env.ENV}, ENABLE_PG_MIRROR=${process.env.ENABLE_PG_MIRROR}`,
      );
    }
  } catch (err) {
    console.warn(
      "[cloudSyncService] Gagal memperbarui file .env:",
      err.message,
    );
  }

  return {
    status: "OK",
    message: toProd
      ? "Berhasil beralih ke Mode Produksi (Mirror PostgreSQL aktif, target WhatsApp: Grup Utama Warga)."
      : "Berhasil beralih ke Mode Uji Coba (Mirror PostgreSQL mati, target WhatsApp: Grup Testing).",
    data: getAppMode(),
    sync_result: syncActionResult,
  };
}

module.exports = {
  SYNC_TABLES,
  ensureCloudTablesExist,
  getPreviewStatus,
  executeFullPull,
  executeFullPush,
  getAppMode,
  switchAppMode,
};
