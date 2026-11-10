const fs = require("fs");
const path = require("path");

const targetFile = path.join(__dirname, "..", "src", "services", "cloudSyncService.js");

const code = `const fs = require("fs");
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
  return new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 35000,
  });
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
      canPull = false; // DILARANG TARIK DATA KARENA AKAN MENGHAPUS DATA LOKAL YG LEBIH BARU
      canPush = true;  // DIPERBOLEHKAN UNGGAH KE CLOUD
      message = \`Proteksi Aktif: Database lokal lebih baru dibanding Cloud (Cloud tertinggal \${daysAhead} hari inputan ronda). Dilarang menarik data dari Cloud agar data lokal tidak terhapus!\`;
    } else if (daysBehind > 0 || (cloudMaxTanggal && localMaxTanggal && cloudMaxTanggal > localMaxTanggal)) {
      status = "BEHIND";
      isLocalAhead = false;
      canPull = true;
      canPush = false;
      message = \`Data lokal tertinggal \${daysBehind} hari inputan ronda (tanggal terakhir di cloud: \${cloudMaxTanggal}, lokal: \${localMaxTanggal || "belum ada"}).\`;
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
        \`Proteksi Kehilangan Data: Database Cloud tertinggal \${preview.days_ahead} hari dari database lokal (\${preview.local.max_tanggal} vs Cloud \${preview.cloud.max_tanggal}). Penarikan data dari Cloud dibatalkan agar data lokal yang lebih baru tidak terhapus!\`
      );
    }
  }

  let pool;
  let pgClient;
  let sqlite;

  const tables = [
    {
      name: "ref_warga",
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
      columns: ["id", "tanggal", "keterangan", "created_at"],
      transform: (row) => ({
        ...row,
        created_at: formatVal(row.created_at),
      }),
    },
    {
      name: "hitung_ulang_jimpitan_harian",
      columns: ["tanggal", "nominal_hitung_ulang", "created_at"],
      transform: (row) => ({
        ...row,
        created_at: formatVal(row.created_at),
      }),
    },
    {
      name: "pengeluaran",
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
      columns: ["id", "tanggal", "nomor_rumah", "nama_penghuni", "waktu_input"],
      transform: (row) => ({
        ...row,
        waktu_input: formatVal(row.waktu_input),
      }),
    },
    {
      name: "rapel",
      columns: ["id", "nomor_rumah", "tanggal"],
      transform: (row) => row,
    },
    {
      name: "rekap",
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
  ];

  const migratedSummary = {};

  try {
    pool = getPgPool();
    sqlite = getSqliteDb();

    console.log("[cloudSyncService] Connecting to PostgreSQL for full pull...");
    pgClient = await pool.connect();
    console.log("[cloudSyncService] PostgreSQL connected!");

    for (const t of tables) {
      console.log(\`[cloudSyncService] Migrating table: \${t.name}...\`);
      const pgRes = await pgClient.query(\`SELECT * FROM "\${t.name}"\`);

      await runSqlite(sqlite, "BEGIN TRANSACTION");
      try {
        await runSqlite(sqlite, \`DELETE FROM "\${t.name}"\`);

        const colList = t.columns.map((c) => \`"\${c}"\`).join(", ");
        const placeholders = t.columns.map(() => "?").join(", ");
        const insertSql = \`INSERT OR REPLACE INTO "\${t.name}" (\${colList}) VALUES (\${placeholders})\`;

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
          \`[cloudSyncService] \${t.name} migrated: \${pgRes.rows.length} rows.\`,
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

  const tables = [
    {
      name: "ref_warga",
      columns: ["nomor", "nama", "sudah_menghuni", "tanggal_huni", "no_hp"],
    },
    {
      name: "tanggal_pemutihan",
      columns: ["id", "tanggal", "keterangan", "created_at"],
    },
    {
      name: "hitung_ulang_jimpitan_harian",
      columns: ["tanggal", "nominal_hitung_ulang", "created_at"],
    },
    {
      name: "pengeluaran",
      columns: [
        "id",
        "tanggal",
        "nominal",
        "penanggung_jawab",
        "keterangan",
        "bukti_foto",
        "created_at",
      ],
    },
    {
      name: "presensi_ronda",
      columns: ["id", "tanggal", "nomor_rumah", "nama_penghuni", "waktu_input"],
    },
    {
      name: "rapel",
      columns: ["id", "nomor_rumah", "tanggal"],
    },
    {
      name: "rekap",
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
    },
    {
      name: "jimpitan",
      columns: [
        "id",
        "tanggal",
        "nomor_rumah",
        "nama_pengisi",
        "jumlah",
        "diambil_oleh",
        "waktu_input",
      ],
    },
  ];

  const pushedSummary = {};

  try {
    pool = getPgPool();
    sqlite = getSqliteDb();

    console.log("[cloudSyncService] Menghubungkan ke PostgreSQL untuk full push...");
    pgClient = await pool.connect();
    console.log("[cloudSyncService] PostgreSQL connected!");

    await pgClient.query("BEGIN");

    for (const t of tables) {
      console.log(\`[cloudSyncService] Mengunggah tabel \${t.name} ke Cloud...\`);
      const sqliteRows = await new Promise((res, rej) => {
        sqlite.all(\`SELECT * FROM "\${t.name}"\`, [], (err, rows) => {
          if (err) rej(err);
          else res(rows || []);
        });
      });

      // Kosongkan tabel di PG lalu isi dengan seluruh data lokal
      await pgClient.query(\`DELETE FROM "\${t.name}"\`);

      if (sqliteRows.length > 0) {
        const colList = t.columns.map((c) => \`"\${c}"\`).join(", ");
        const placeholders = t.columns.map((_, idx) => \`$\${idx + 1}\`).join(", ");
        const insertSql = \`INSERT INTO "\${t.name}" (\${colList}) VALUES (\${placeholders})\`;

        for (const row of sqliteRows) {
          const values = t.columns.map((c) => row[c] ?? null);
          await pgClient.query(insertSql, values);
        }
      }

      pushedSummary[t.name] = sqliteRows.length;
      console.log(\`[cloudSyncService] \${t.name} berhasil diunggah: \${sqliteRows.length} baris.\`);
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
    // Jika data lokal LEBIH BARU dibanding Cloud, jangan PULL! Justru PUSH data lokal ke Cloud!
    if (preview.connected && preview.is_local_ahead) {
      console.log(
        "[cloudSyncService] Beralih ke PROD: Data lokal lebih baru, melakukan full PUSH ke PostgreSQL...",
      );
      syncActionResult = await executeFullPush();
    } else if (preview.connected && preview.can_pull) {
      console.log(
        "[cloudSyncService] Beralih ke PROD: Menarik seluruh data terbaru dari PostgreSQL terlebih dahulu...",
      );
      syncActionResult = await executeFullPull();
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
        content = content.replace(/^ENV=.*$/m, \`ENV="\${process.env.ENV}"\`);
      } else {
        content += \`\\nENV="\${process.env.ENV}"\`;
      }

      if (/^ENABLE_PG_MIRROR=.*$/m.test(content)) {
        content = content.replace(
          /^ENABLE_PG_MIRROR=.*$/m,
          \`ENABLE_PG_MIRROR="\${process.env.ENABLE_PG_MIRROR}"\`,
        );
      } else {
        content += \`\\nENABLE_PG_MIRROR="\${process.env.ENABLE_PG_MIRROR}"\`;
      }

      fs.writeFileSync(ENV_PATH, content, "utf8");
      console.log(
        \`[cloudSyncService] File .env diperbarui: ENV=\${process.env.ENV}, ENABLE_PG_MIRROR=\${process.env.ENABLE_PG_MIRROR}\`,
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
  getPreviewStatus,
  executeFullPull,
  executeFullPush,
  getAppMode,
  switchAppMode,
};
`;

fs.writeFileSync(targetFile, code, 'utf8');
console.log('cloudSyncService.js updated with push and protection logic!');
