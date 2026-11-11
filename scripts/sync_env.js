#!/usr/bin/env node
/**
 * scripts/sync_env.js
 * Script sinkronisasi file .env dengan template .env.example
 * - Menjaga semua nilai rahasia lama (database, telegram, key gemini, grup ID, dsb)
 * - Menambahkan variabel baru dari fitur hari ini yang belum ada di .env
 * - Memberikan nilai default yang benar untuk admin & model Gemini
 * - Membuat backup otomatis .env sebelum diubah
 */

const fs = require("fs");
const path = require("path");

const backendDir = path.resolve(__dirname, "../");
const envPath = path.join(backendDir, ".env");
const examplePath = path.join(backendDir, ".env.example");

if (!fs.existsSync(examplePath)) {
  console.error("❌ File .env.example tidak ditemukan di:", examplePath);
  process.exit(1);
}

// Nilai default yang presisi untuk variabel baru / penting
const KNOWN_DEFAULTS = {
  ADMIN_PHONE_NUMBER: "6289673378055",
  FAMILY_PHONE_IBU: "6285867402287",
  GEMINI_MODEL: "gemini-2.5-flash",
  KEUANGAN_RUMAH_PINS: "1234,5678",
  API_SECRET_KEY: "rahasiakita123",
  ADMIN_USERS: "admin:passwordadmin:Administrator",
  ENABLE_PG_MIRROR: "true",
  PORT: "3000",
  ENV: "production",
};

function parseEnv(content) {
  const map = new Map();
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      map.set(key, val);
    }
  }
  return map;
}

function isDummyValue(key, val) {
  if (!val) return true;
  if (key === "ADMIN_PHONE_NUMBER" && (val.includes("000000") || val.length < 8)) return true;
  if (key === "FAMILY_PHONE_IBU" && (val.includes("000000") || val.length < 8)) return true;
  if (key === "GEMINI_MODEL" && (val.includes("3.5") || val === "")) return true;
  return false;
}

function run() {
  console.log("==================================================");
  console.log("   SINKRONISASI FILE .env JIMPITAN V2");
  console.log("==================================================");

  let existingEnv = new Map();
  if (fs.existsSync(envPath)) {
    const existingContent = fs.readFileSync(envPath, "utf8");
    existingEnv = parseEnv(existingContent);

    // Buat backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backendDir, `.env.backup-${timestamp}`);
    fs.writeFileSync(backupPath, existingContent, "utf8");
    console.log(`✅ Backup file .env lama berhasil dibuat:\n   ${backupPath}\n`);
  } else {
    console.log("ℹ️ File .env belum ada, akan dibuat dari .env.example.\n");
  }

  const exampleContent = fs.readFileSync(examplePath, "utf8");
  const exampleLines = exampleContent.split("\n");

  const newLines = [];
  const processedKeys = new Set();
  const addedKeys = [];
  const updatedKeys = [];

  for (const line of exampleLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      newLines.push(line);
      continue;
    }

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const defaultExampleVal = trimmed.slice(eqIdx + 1).trim();
      processedKeys.add(key);

      let finalVal = defaultExampleVal;

      if (existingEnv.has(key)) {
        const currentVal = existingEnv.get(key);
        if (isDummyValue(key, currentVal) && KNOWN_DEFAULTS[key]) {
          finalVal = KNOWN_DEFAULTS[key];
          updatedKeys.push(`${key}: "${currentVal}" -> "${finalVal}" (diperbaiki dari dummy)`);
        } else {
          finalVal = currentVal; // Pertahankan nilai asli lama user
        }
      } else {
        // Variabel baru yang belum ada di .env
        finalVal = KNOWN_DEFAULTS[key] || defaultExampleVal;
        addedKeys.push(`${key}=${finalVal}`);
      }

      newLines.push(`${key}=${finalVal}`);
    } else {
      newLines.push(line);
    }
  }

  // Tambahkan variabel kustom pengguna yang mungkin ada di .env lama tapi tidak ada di .env.example
  const customExtraKeys = [];
  for (const [k, v] of existingEnv.entries()) {
    if (!processedKeys.has(k)) {
      customExtraKeys.push(`${k}=${v}`);
    }
  }

  if (customExtraKeys.length > 0) {
    newLines.push("");
    newLines.push("# ==============================================================");
    newLines.push("# VARIABEL TAMBAHAN DARI .env SEBELUMNYA");
    newLines.push("# ==============================================================");
    for (const line of customExtraKeys) {
      newLines.push(line);
    }
  }

  fs.writeFileSync(envPath, newLines.join("\n"), "utf8");

  console.log("--------------------------------------------------");
  if (addedKeys.length > 0) {
    console.log(`➕ Variabel Baru Ditambahkan (${addedKeys.length}):`);
    for (const k of addedKeys) console.log(`   • ${k}`);
  } else {
    console.log("ℹ️ Tidak ada variabel baru yang perlu ditambahkan.");
  }

  if (updatedKeys.length > 0) {
    console.log(`\n🔄 Nilai Diperbarui (${updatedKeys.length}):`);
    for (const k of updatedKeys) console.log(`   • ${k}`);
  }

  console.log("--------------------------------------------------");
  console.log("✅ File .env berhasil disinkronkan dan siap digunakan!");
  console.log("💡 Jangan lupa restart backend dengan:");
  console.log("   sudo systemctl restart jimpitan-backend\n");
}

run();
