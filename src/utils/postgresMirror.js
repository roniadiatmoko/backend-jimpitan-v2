const { Pool } = require("pg");
const { sendTelegramMessage } = require("./telegramSender");

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: process.env.PGSSL === "true" ? true : undefined,
  connectionTimeoutMillis: 12000,
});

pool.on("error", (error) => {
  console.error("Koneksi idle PostgreSQL bermasalah:", error.message);
});

const retryDelays = [15000, 15000, 30000, 45000, 60000];
let operationQueue = Promise.resolve();
let wakePromise;

function isConfigured() {
  return Boolean(
    process.env.PGHOST &&
      process.env.PGUSER &&
      process.env.PGPASSWORD &&
      process.env.PGDATABASE,
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function wakeLayerbase() {
  if (!isConfigured()) {
    console.error("Konfigurasi PostgreSQL belum lengkap; Layerbase tidak dibangunkan.");
    return Promise.resolve(false);
  }
  if (wakePromise) return wakePromise;

  wakePromise = (async () => {
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      if (attempt > 0) await delay(retryDelays[attempt - 1]);

      try {
        await pool.query("SELECT 1");
        console.log("PostgreSQL Layerbase aktif.");
        return true;
      } catch (error) {
        console.warn(
          `Probe PostgreSQL Layerbase gagal, percobaan ${attempt + 1}:`,
          error.message,
        );
      }
    }

    console.error("PostgreSQL Layerbase belum berhasil dibangunkan.");
    return false;
  })().finally(() => {
    wakePromise = undefined;
  });

  return wakePromise;
}

async function sendTelegramNotification(message) {
  try {
    await sendTelegramMessage(message);
  } catch (notificationError) {
    console.error(
      "Gagal mengirim notifikasi mirror ke Telegram:",
      notificationError.message,
    );
  }
}

async function notifyFailure(label, error, attemptCount) {
  const message = [
    "Gagal sinkronisasi PostgreSQL",
    `Operasi: ${label}`,
    `Percobaan: ${attemptCount}`,
    `Error: ${String(error.message || error).slice(0, 250)}`,
  ].join("\n");

  await sendTelegramNotification(message);
}

async function runWithRetry(label, operation) {
  let lastError;

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    if (attempt > 0) await delay(retryDelays[attempt - 1]);

    try {
      await operation(pool);
      await sendTelegramNotification(
        "INPUT KE SERVER MIRROR LAYERBASE DB BERHASIL",
      );
      return;
    } catch (error) {
      lastError = error;
      console.error(
        `Mirror PostgreSQL gagal (${label}), percobaan ${attempt + 1}:`,
        error.message,
      );
    }
  }

  await notifyFailure(label, lastError, retryDelays.length + 1);
}

function enqueueMirror(label, operation) {
  if (!isConfigured()) return;

  operationQueue = operationQueue.then(
    () => runWithRetry(label, operation),
    () => runWithRetry(label, operation),
  );
}

async function withTransaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { enqueueMirror, wakeLayerbase, withTransaction };