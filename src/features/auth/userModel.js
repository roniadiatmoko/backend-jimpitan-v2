const crypto = require("crypto");
const { enqueueMirror } = require("../../utils/postgresMirror");

function hashPassword(password) {
  if (!password) return "";
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !password) return false;
  try {
    if (storedHash.startsWith("scrypt$")) {
      const parts = storedHash.split("$");
      if (parts.length === 3) {
        const [, salt, originalHash] = parts;
        const testHash = crypto.scryptSync(password, salt, 64).toString("hex");
        const bufA = Buffer.from(testHash, "hex");
        const bufB = Buffer.from(originalHash, "hex");
        if (bufA.length === bufB.length) {
          return crypto.timingSafeEqual(bufA, bufB);
        }
      }
    }
  } catch (err) {
    console.error("[Auth] Error verifying hash:", err.message);
  }
  // Plain text fallback (misal jika ada data lama/transisi)
  return storedHash === password;
}

function parseAdminUsersEnv() {
  const rawUsers =
    process.env.ADMIN_USERS ||
    "menterijimpitan:menterijimpitan:Menteri Jimpitan,ketua:kepalasuku:Ketua Paguyuban";

  return rawUsers.split(",").map((item) => {
    const parts = item.trim().split(":");
    const username = parts[0]?.trim();
    const password = parts[1]?.trim();
    const fullname = parts[2]?.trim() || username;
    const role = username === "ketua" ? "ketua" : "bendahara";
    return { username, password, fullname, role };
  }).filter((u) => u.username && u.password);
}

function initUserTable(sqliteDb) {
  return new Promise((resolve, reject) => {
    sqliteDb.serialize(() => {
      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          fullname TEXT,
          role TEXT DEFAULT 'admin',
          created_at TEXT,
          updated_at TEXT
        )
      `, (err) => {
        if (err) {
          console.error("[Auth] Gagal membuat tabel users SQLite:", err.message);
          return reject(err);
        }

        sqliteDb.run(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)",
          async (idxErr) => {
            if (idxErr) console.warn("[Auth] Index warning:", idxErr.message);

            try {
              await seedDefaultUsers(sqliteDb);
              resolve();
            } catch (seedErr) {
              console.error("[Auth] Gagal seed user awal:", seedErr.message);
              resolve(); // jangan crash app
            }
          }
        );
      });
    });
  });
}

async function seedDefaultUsers(sqliteDb) {
  const defaults = parseAdminUsersEnv();
  const now = new Date().toISOString();

  for (const def of defaults) {
    await new Promise((res) => {
      sqliteDb.get("SELECT id, username FROM users WHERE username = ?", [def.username], (err, row) => {
        if (err) {
          console.warn("[Auth] Check user error:", err.message);
          return res();
        }

        if (!row) {
          const hashedPassword = hashPassword(def.password);
          sqliteDb.run(
            `INSERT INTO users (username, password_hash, fullname, role, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [def.username, hashedPassword, def.fullname, def.role, now, now],
            function (insertErr) {
              if (insertErr) {
                console.error(`[Auth] Gagal men-seed user ${def.username}:`, insertErr.message);
              } else {
                console.log(`[Auth] Berhasil membuat akun awal: ${def.username} (${def.fullname}) [ID: ${this.lastID}]`);
                // Mirror ke PostgreSQL
                const newId = this.lastID;
                enqueueMirror(`users seed ${def.username}`, (pool) => {
                  return pool.query(
                    `INSERT INTO "users" (id, username, password_hash, fullname, role, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (username) DO NOTHING`,
                    [newId, def.username, hashedPassword, def.fullname, def.role, now, now]
                  );
                });
              }
              res();
            }
          );
        } else {
          res();
        }
      });
    });
  }
}

function getUserByUsername(sqliteDb, username) {
  return new Promise((resolve, reject) => {
    if (!username) return resolve(null);
    sqliteDb.get(
      "SELECT id, username, password_hash, fullname, role, created_at, updated_at FROM users WHERE username = ?",
      [username.trim()],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function listUsers(sqliteDb) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(
      "SELECT id, username, fullname, role, created_at, updated_at FROM users ORDER BY id ASC",
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

function updatePassword(sqliteDb, username, newPassword) {
  return new Promise((resolve, reject) => {
    const hashedPassword = hashPassword(newPassword);
    const now = new Date().toISOString();

    sqliteDb.run(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?",
      [hashedPassword, now, username.trim()],
      function (err) {
        if (err) return reject(err);
        if (this.changes === 0) {
          return reject(new Error("User tidak ditemukan"));
        }

        // Mirror ke PostgreSQL
        enqueueMirror(`users update password ${username}`, (pool) => {
          return pool.query(
            `UPDATE "users" SET password_hash = $1, updated_at = $2 WHERE username = $3`,
            [hashedPassword, now, username.trim()]
          );
        });

        resolve({ success: true, updated_at: now });
      }
    );
  });
}

function updateUserPasswordHash(sqliteDb, userId, newHash) {
  return new Promise((resolve) => {
    const now = new Date().toISOString();
    sqliteDb.run(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
      [newHash, now, userId],
      () => resolve()
    );
  });
}

module.exports = {
  hashPassword,
  verifyPassword,
  initUserTable,
  seedDefaultUsers,
  getUserByUsername,
  listUsers,
  updatePassword,
  updateUserPasswordHash,
  parseAdminUsersEnv,
};
