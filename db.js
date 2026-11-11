// db.js

const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db.sqlite");
const { format, lastDayOfMonth } = require("date-fns");
const { id } = require("date-fns/locale");
const { enqueueMirror, withTransaction } = require("./src/utils/postgresMirror");
const { initUserTable } = require("./src/features/auth/userModel");

// Buat tabel jika belum ada
db.serialize(() => {
  // table users (manajemen akun admin & ketua)
  initUserTable(db).catch((e) => console.warn("[DB] initUserTable warning:", e.message));

  //table jimpitan
  db.run(`
    CREATE TABLE IF NOT EXISTS jimpitan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT,
      nomor_rumah TEXT,
      nama_pengisi TEXT,
      jumlah INTEGER,
      diambil_oleh TEXT,
      waktu_input TEXT
    )
  `);

  //table rapel
  db.run(`
    CREATE TABLE IF NOT EXISTS rapel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nomor_rumah TEXT,
      tanggal TEXT)`);
  
  //table pengeluaran
  db.run(`
    CREATE TABLE IF NOT EXISTS pengeluaran (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT,
      nominal TEXT,
      penanggung_jawab TEXT,
      keterangan TEXT,
      bukti_foto TEXT,
      created_at TEXT
    )
    `)

  //table hitung ulang jimpitan harian
  db.run(`
    CREATE TABLE IF NOT EXISTS hitung_ulang_jimpitan_harian (
      tanggal TEXT PRIMARY KEY,
      nominal_hitung_ulang TEXT,
      created_at TEXT
      )
    `
  )

  //table presensi ronda
  db.run(`
    CREATE TABLE IF NOT EXISTS presensi_ronda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT,
      nomor_rumah TEXT,
      nama_penghuni TEXT,
      waktu_input TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tanggal, nomor_rumah)
    )
  `);

  //table jadwal petugas ronda mingguan
  db.run(`
    CREATE TABLE IF NOT EXISTS jadwal_petugas_ronda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hari TEXT NOT NULL,
      nomor_rumah TEXT NOT NULL,
      nama_penghuni TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(hari, nomor_rumah)
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_jadwal_ronda_hari ON jadwal_petugas_ronda(hari)");

  //table tanggal pemutihan
  db.run(`
    CREATE TABLE IF NOT EXISTS tanggal_pemutihan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT,
      keterangan TEXT,
      created_at TEXT
    )
  `);
  db.run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_tanggal_pemutihan_tanggal ON tanggal_pemutihan(tanggal)",
  );

  //table referensi warga
  db.run(`
    CREATE TABLE IF NOT EXISTS ref_warga (
      nomor INTEGER PRIMARY KEY,
      nama TEXT,
      sudah_menghuni INTEGER,
      tanggal_huni DATE,
      no_hp TEXT
    )
  `);

  //table rekap saldo bulanan
  db.run(`
    CREATE TABLE IF NOT EXISTS rekap (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bulan TEXT,
      tahun TEXT,
      saldo_sebelumnya REAL,
      pemasukan REAL,
      pengeluaran REAL,
      sisa_saldo REAL,
      keterangan TEXT,
      is_kunci_sinkron INTEGER DEFAULT 0
    )
  `);
  db.run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_rekap_periode ON rekap(bulan, tahun)",
  );
  // Migrasi untuk database lama yang belum punya kolom is_kunci_sinkron
  db.run(
    "ALTER TABLE rekap ADD COLUMN is_kunci_sinkron INTEGER DEFAULT 0",
    () => {},
  );

  // Table keuangan rumah tangga pribadi (terpisah dari kas warga)
  db.run(`
    CREATE TABLE IF NOT EXISTS keuangan_rumah (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT,
      jenis TEXT DEFAULT 'pengeluaran',
      kategori TEXT,
      nominal INTEGER,
      keterangan TEXT,
      sumber_dana TEXT DEFAULT 'Cash',
      dicatat_oleh TEXT,
      created_at TEXT
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_keuangan_rumah_tgl ON keuangan_rumah(tanggal)");
  db.run("CREATE INDEX IF NOT EXISTS idx_keuangan_rumah_kategori ON keuangan_rumah(kategori)");
});

// FUNGSI UTAMA: Hapus data untuk tanggal tertentu, lalu masukkan data baru
function hapusDanSimpanJimpitanHarian(tanggal, diambil_oleh, data) {
  return new Promise((resolve, reject) => {
    // Jalankan operasi DELETE, kemudian INSERT
    db.serialize(() => {
      // Hapus data yang ada untuk tanggal ini
      db.run("DELETE FROM jimpitan WHERE tanggal = ?", [tanggal], (err) => {
        if (err) {
          return reject(err);
        }

        // Loop melalui semua data yang dikirim dari frontend dan simpan
        const stmt = db.prepare(`
          INSERT INTO jimpitan (tanggal, nomor_rumah, nama_pengisi, jumlah, diambil_oleh, waktu_input)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        const waktu_input = new Date().toISOString();
        const promises = data.map((item) => {
          return new Promise((res, rej) => {
            // PERBAIKAN: Menggunakan item.status langsung untuk mengisi kolom jumlah
            stmt.run(
              [
                tanggal,
                item.nomor,
                item.nama,
                item.status,
                diambil_oleh,
                waktu_input,
              ],
              (err) => {
                if (err) rej(err);
                else res();
              },
            );
          });
        });

        Promise.all(promises)
          .then(() => {
            stmt.finalize((finalizeError) => {
              if (finalizeError) return reject(finalizeError);

              db.all(
                "SELECT id, tanggal, nomor_rumah, nama_pengisi, jumlah, diambil_oleh, waktu_input FROM jimpitan WHERE tanggal = ? ORDER BY id",
                [tanggal],
                (readError, rows) => {
                  if (readError) return reject(readError);

                  enqueueMirror(`jimpitan ${tanggal}`, (pool) =>
                    withTransaction(pool, async (client) => {
                      await client.query(
                        "DELETE FROM jimpitan WHERE tanggal = $1",
                        [tanggal],
                      );
                      for (const row of rows) {
                        await client.query(
                          "INSERT INTO jimpitan (id, tanggal, nomor_rumah, nama_pengisi, jumlah, diambil_oleh, waktu_input) VALUES ($1, $2, $3, $4, $5, $6, $7)",
                          [
                            row.id,
                            row.tanggal,
                            row.nomor_rumah,
                            row.nama_pengisi,
                            row.jumlah,
                            row.diambil_oleh,
                            row.waktu_input,
                          ],
                        );
                      }
                    }),
                  );
                  resolve();
                },
              );
            });
          })
          .catch((err) => {
            stmt.finalize();
            reject(err);
          });
      });
    });
  });
}

// FUNGSI BARU: Mengambil laporan harian dengan status gabungan (terisi, rapel, kosong)
function ambilLaporanHarian(tanggal) {
  return new Promise((resolve, reject) => {
    // 1. Ambil data jimpitan untuk tanggal tersebut
    const jimpitanPromise = new Promise((res, rej) => {
      db.all(
        "SELECT nomor_rumah, nama_pengisi, jumlah FROM jimpitan WHERE tanggal = ?",
        [tanggal],
        (err, rows) => {
          if (err) rej(err);
          else res(rows);
        },
      );
    });

    // 2. Ambil data rapel untuk tanggal tersebut
    const rapelPromise = new Promise((res, rej) => {
      db.all(
        "SELECT nomor_rumah FROM rapel WHERE tanggal = ?",
        [tanggal],
        (err, rows) => {
          if (err) rej(err);
          else res(rows.map((row) => row.nomor_rumah));
        },
      );
    });

    Promise.all([jimpitanPromise, rapelPromise])
      .then(([jimpitanRows, rapelRows]) => {
        let totalTerisi = 0;
        let totalRapel = 0;
        let totalTidakTerisi = 0;

        // Buat objek untuk pencarian cepat dan menggabungkan data
        const laporanMap = new Map();
        const rapelSet = new Set(rapelRows);

        // Proses data jimpitan terlebih dahulu
        jimpitanRows.forEach((row) => {
          const status_terisi =
            row.jumlah === 1
              ? "Terisi"
              : rapelSet.has(row.nomor_rumah)
                ? "Rapel"
                : "Kosong";
          laporanMap.set(row.nomor_rumah, {
            nomor_rumah: row.nomor_rumah,
            nama_pengisi: row.nama_pengisi,
            status_terisi: status_terisi,
          });
        });

        // Proses data rapel untuk rumah yang tidak ada di jimpitan
        rapelRows.forEach((nomor_rumah) => {
          if (!laporanMap.has(nomor_rumah)) {
            laporanMap.set(nomor_rumah, {
              nomor_rumah: nomor_rumah,
              nama_pengisi: "-",
              status_terisi: "Rapel",
            });
          }
        });

        // Mengonversi Map menjadi array laporan dan menghitung total
        const laporan = Array.from(laporanMap.values());
        laporan.forEach((item) => {
          if (item.status_terisi === "Terisi") totalTerisi++;
          else if (item.status_terisi === "Rapel") totalRapel++;
          else if (item.status_terisi === "Kosong") totalTidakTerisi++;
        });

        const totalUang = totalTerisi * 500;

        resolve({
          tanggal,
          laporan,
          totalTerisi,
          totalRapel,
          totalTidakTerisi,
          totalUang,
        });
      })
      .catch(reject);
  });
}

//simpan rapel harian
function simpanRapelHarian(nomor_rumah, tanggal) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO rapel (nomor_rumah, tanggal) VALUES (?, ?)",
    );
    stmt.run([nomor_rumah, tanggal], function (err) {
      if (err) return reject(err);
      const id = this.lastID;
      stmt.finalize((finalizeError) => {
        if (finalizeError) return reject(finalizeError);
        enqueueMirror(`rapel ${id}`, (pool) =>
          pool.query(
            "INSERT INTO rapel (id, nomor_rumah, tanggal) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
            [id, nomor_rumah, tanggal],
          ),
        );
        resolve();
      });
    });
  });
}

//ambil rapel harian
function ambilRapelHarian(tanggal) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT nomor_rumah FROM rapel WHERE tanggal = ?",
      [tanggal],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map((row) => row.nomor_rumah));
      },
    );
  });
}

//ambil rapel bulanan
function ambilRapelBulanan(bulan) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT r.nomor_rumah, count(1) as jumlah_rapel, count(1) * 500 as nominal, w.nama FROM rapel r LEFT JOIN ref_warga w ON CAST(r.nomor_rumah AS INTEGER) = w.nomor WHERE SUBSTR(r.tanggal, 1, 7) = ? GROUP BY r.nomor_rumah ORDER BY CAST(r.nomor_rumah AS INTEGER) ASC",
      [bulan],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      },
    );
  });
}

/**
 * FUNGSI BARU: Mengambil tanggal yang belum terisi jimpitan di bulan ini
 * @param {number} nomor_rumah - Nomor rumah yang dicek.
 * @param {string} bulan - Bulan dalam format 'YYYY-MM'.
 * @returns {Promise<Array<string>>} - Array tanggal yang belum terisi jimpitan.
 */
function ambilTanggalJimpitanKosong(nomor_rumah, bulan) {
  return new Promise(async (resolve, reject) => {
    try {
      const terisi = await ambilTanggalJimpitanTerisi(nomor_rumah, bulan);
      const terisiRapel = await ambilTanggalRapelTerisi(nomor_rumah, bulan);

      // Gabungkan dan hilangkan duplikasi dari tanggal yang terisi jimpitan atau rapel
      const semuaTerisi = [...new Set([...terisi, ...terisiRapel])];
      console.log("terisi harian:", terisi);

      const [tahun, bulanStr] = bulan.split("-");
      const tanggalTerakhir = lastDayOfMonth(
        new Date(tahun, parseInt(bulanStr) - 1),
      );
      const semuaTanggalBulanIni = [];
      for (let d = 1; d <= tanggalTerakhir.getDate(); d++) {
        semuaTanggalBulanIni.push(
          format(new Date(tahun, parseInt(bulanStr) - 1, d), "yyyy-MM-dd"),
        );
      }

      // Filter untuk menemukan tanggal yang belum terisi (kosong)
      const tanggalKosong = semuaTanggalBulanIni.filter(
        (tanggal) => !semuaTerisi.includes(tanggal),
      );

      resolve(tanggalKosong);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * FUNGSI BARU: Mengambil semua tanggal yang sudah terisi jimpitan di bulan ini
 * @param {number} nomor_rumah - Nomor rumah yang dicek.
 * @param {string} bulan - Bulan dalam format 'YYYY-MM'.
 * @returns {Promise<Array<string>>} - Array tanggal yang sudah terisi jimpitan.
 */
function ambilTanggalJimpitanTerisi(nomor_rumah, bulan) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT tanggal FROM jimpitan WHERE nomor_rumah = ? AND SUBSTR(tanggal, 1, 7) = ? and jumlah <> 0",
      [nomor_rumah, bulan],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map((row) => row.tanggal));
      },
    );
  });
}

// FUNGSI BARU: Mengambil semua tanggal rapel untuk rumah tertentu di bulan ini
function ambilTanggalRapelTerisi(nomor_rumah, bulan) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT tanggal FROM rapel WHERE nomor_rumah = ? AND SUBSTR(tanggal, 1, 7) = ?",
      [nomor_rumah, bulan],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map((row) => row.tanggal));
      },
    );
  });
}

function ambilSemuaData() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM jimpitan ORDER BY tanggal DESC, nomor_rumah ASC",
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      },
    );
  });
}

//bulan=yyyy-mm
function ambilJimpitanPerBulan(bulan) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT tanggal, count(1) terisi, count(1)*500 nominal  FROM jimpitan WHERE SUBSTR(tanggal, 1, 7) = ? and jumlah <> 0 GROUP BY tanggal ORDER BY tanggal ASC, nomor_rumah ASC",
      [bulan],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      },
    );
  });
}

//ambil pengeluaran yyyy-mm atau yyyy
function ambilPengeluaran(bulan){
  return new Promise((resolve, reject) => {
    const isYear = String(bulan).length === 4;
    const query = isYear
      ? "SELECT * from pengeluaran WHERE SUBSTR(tanggal, 1, 4) = ? ORDER BY tanggal ASC"
      : "SELECT * from pengeluaran WHERE SUBSTR(tanggal, 1, 7) = ? ORDER BY tanggal ASC";
    db.all(
      query,
      [bulan],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      },
    );
  });
}

function simpanPengeluaran(tanggal, nominal, penanggung_jawab, keterangan, bukti_foto){
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    db.run(
      "INSERT INTO pengeluaran (tanggal, nominal, penanggung_jawab, keterangan, bukti_foto, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [tanggal, nominal, penanggung_jawab, keterangan, bukti_foto, createdAt],
      function (err) {
        if (err) reject(err);
        else {
          const id = this.lastID;
          enqueueMirror(`pengeluaran ${id}`, (pool) =>
            pool.query(
              "INSERT INTO pengeluaran (id, tanggal, nominal, penanggung_jawab, keterangan, bukti_foto, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET tanggal = EXCLUDED.tanggal, nominal = EXCLUDED.nominal, penanggung_jawab = EXCLUDED.penanggung_jawab, keterangan = EXCLUDED.keterangan, bukti_foto = EXCLUDED.bukti_foto, created_at = EXCLUDED.created_at",
              [id, tanggal, nominal, penanggung_jawab, keterangan, bukti_foto, createdAt],
            ),
          );
          resolve();
        }
      }
    )
  })
}

function updatePengeluaran(id, tanggal, nominal, penanggung_jawab, keterangan, bukti_foto) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE pengeluaran SET tanggal = ?, nominal = ?, penanggung_jawab = ?, keterangan = ?, bukti_foto = ? WHERE id = ?",
      [tanggal, nominal, penanggung_jawab, keterangan, bukti_foto, id],
      function (err) {
        if (err) return reject(err);
        const changes = this.changes;
        if (changes > 0) {
          enqueueMirror("ubah pengeluaran " + id, (pool) =>
            pool.query(
              "UPDATE pengeluaran SET tanggal = $1, nominal = $2, penanggung_jawab = $3, keterangan = $4, bukti_foto = $5 WHERE id = $6",
              [tanggal, nominal, penanggung_jawab, keterangan, bukti_foto, id],
            ),
          );
        }
        resolve(changes);
      },
    );
  });
}

function hapusPengeluaran(id) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM pengeluaran WHERE id = ?", [id], function (err) {
      if (err) return reject(err);
      enqueueMirror(`hapus pengeluaran ${id}`, (pool) =>
        pool.query("DELETE FROM pengeluaran WHERE id = $1", [id]),
      );
      resolve(this.changes);
    });
  });
}

// --- TANGGAL PEMUTIHAN HELPERS ---
function simpanTanggalPemutihan(tanggal, keterangan) {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    db.run(
      "INSERT OR IGNORE INTO tanggal_pemutihan (tanggal, keterangan, created_at) VALUES (?, ?, ?)",
      [tanggal, keterangan, createdAt],
      function (err) {
        if (err) return reject(err);
        db.get(
          "SELECT id, tanggal, keterangan, created_at FROM tanggal_pemutihan WHERE tanggal = ?",
          [tanggal],
          (readError, row) => {
            if (readError) return reject(readError);
            if (row) {
              enqueueMirror(`tanggal pemutihan ${tanggal}`, (pool) =>
                withTransaction(pool, async (client) => {
                  await client.query(
                    "DELETE FROM tanggal_pemutihan WHERE tanggal = $1",
                    [tanggal],
                  );
                  await client.query(
                    "INSERT INTO tanggal_pemutihan (id, tanggal, keterangan, created_at) VALUES ($1, $2, $3, $4)",
                    [row.id, row.tanggal, row.keterangan, row.created_at],
                  );
                }),
              );
            }
            resolve(row?.id || this.lastID || null);
          },
        );
      },
    );
  });
}

function ambilTanggalPemutihan(bulan, tahun) {
  return new Promise((resolve, reject) => {
    if (tahun) {
      db.all(
        "SELECT * FROM tanggal_pemutihan WHERE SUBSTR(tanggal,1,4) = ? ORDER BY tanggal ASC",
        [String(tahun)],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    } else if (bulan) {
      db.all(
        "SELECT * FROM tanggal_pemutihan WHERE SUBSTR(tanggal,1,7) = ? ORDER BY tanggal ASC",
        [bulan],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    } else {
      db.all(
        "SELECT * FROM tanggal_pemutihan ORDER BY tanggal ASC",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        },
      );
    }
  });
}

function hapusTanggalPemutihan(id) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM tanggal_pemutihan WHERE id = ?", [id], function (err) {
      if (err) return reject(err);
      enqueueMirror(`hapus tanggal pemutihan ${id}`, (pool) =>
        pool.query("DELETE FROM tanggal_pemutihan WHERE id = $1", [id]),
      );
      resolve(this.changes);
    });
  });
}

function simpanRefWarga(nomor, nama, sudah_menghuni, tanggal_huni, no_hp) {
  let targetNomor = nomor;
  let targetNama = nama;
  let targetSudahMenghuni = sudah_menghuni;
  let targetTanggalHuni = tanggal_huni;
  let targetNoHp = no_hp;

  if (typeof targetNomor === "string" && isNaN(Number(targetNomor))) {
    targetNama = nomor;
    targetSudahMenghuni = nama;
    targetTanggalHuni = sudah_menghuni;
    targetNoHp = tanggal_huni;
    targetNomor = null;
  }

  return new Promise((resolve, reject) => {
    if (targetNomor != null && targetNomor !== "") {
      const numNomor = Number(targetNomor);
      db.run(
        `INSERT INTO ref_warga (nomor, nama, sudah_menghuni, tanggal_huni, no_hp)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (nomor) DO UPDATE SET
           nama = EXCLUDED.nama,
           sudah_menghuni = EXCLUDED.sudah_menghuni,
           tanggal_huni = EXCLUDED.tanggal_huni,
           no_hp = EXCLUDED.no_hp`,
        [numNomor, targetNama, targetSudahMenghuni, targetTanggalHuni, targetNoHp],
        function (err) {
          if (err) return reject(err);
          enqueueMirror(`warga ${numNomor}`, (pool) =>
            pool.query(
              "INSERT INTO ref_warga (nomor, nama, sudah_menghuni, tanggal_huni, no_hp) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (nomor) DO UPDATE SET nama = EXCLUDED.nama, sudah_menghuni = EXCLUDED.sudah_menghuni, tanggal_huni = EXCLUDED.tanggal_huni, no_hp = EXCLUDED.no_hp",
              [numNomor, targetNama, targetSudahMenghuni, targetTanggalHuni, targetNoHp],
            ),
          );
          resolve(numNomor);
        },
      );
    } else {
      db.run(
        "INSERT INTO ref_warga (nama, sudah_menghuni, tanggal_huni, no_hp) VALUES (?, ?, ?, ?)",
        [targetNama, targetSudahMenghuni, targetTanggalHuni, targetNoHp],
        function (err) {
          if (err) return reject(err);
          const newNomor = this.lastID;
          enqueueMirror(`warga ${newNomor}`, (pool) =>
            pool.query(
              "INSERT INTO ref_warga (nomor, nama, sudah_menghuni, tanggal_huni, no_hp) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (nomor) DO UPDATE SET nama = EXCLUDED.nama, sudah_menghuni = EXCLUDED.sudah_menghuni, tanggal_huni = EXCLUDED.tanggal_huni, no_hp = EXCLUDED.no_hp",
              [newNomor, targetNama, targetSudahMenghuni, targetTanggalHuni, targetNoHp],
            ),
          );
          resolve(newNomor || null);
        },
      );
    }
  });
}

function updateRefWarga(currentNomor, newNomor, nama, sudah_menghuni, tanggal_huni, no_hp) {
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE ref_warga SET nomor = ?, nama = ?, sudah_menghuni = ?, tanggal_huni = ?, no_hp = ? WHERE nomor = ?",
      [newNomor, nama, sudah_menghuni, tanggal_huni, no_hp, currentNomor],
      function (err) {
        if (err) return reject(err);
        enqueueMirror(`ubah warga ${currentNomor}`, (pool) =>
          pool.query(
            "UPDATE ref_warga SET nomor = $1, nama = $2, sudah_menghuni = $3, tanggal_huni = $4, no_hp = $5 WHERE nomor = $6",
            [newNomor, nama, sudah_menghuni, tanggal_huni, no_hp, currentNomor],
          ),
        );
        resolve(this.changes);
      },
    );
  });
}

function ambilRefWarga(nomor) {
  return new Promise((resolve, reject) => {
    if (nomor != null) {
      db.get("SELECT * FROM ref_warga WHERE nomor = ?", [nomor], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    } else {
      db.all("SELECT * FROM ref_warga ORDER BY CAST(nomor AS INTEGER) ASC", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    }
  });
}

function hapusRefWarga(nomor) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM ref_warga WHERE nomor = ?", [nomor], function (err) {
      if (err) return reject(err);
      enqueueMirror(`hapus warga ${nomor}`, (pool) =>
        pool.query("DELETE FROM ref_warga WHERE nomor = $1", [nomor]),
      );
      resolve(this.changes);
    });
  });
}

function ambilStatusJimpitanRumahPerBulan(nomor_rumah, bulan) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT j.tanggal, j.nomor_rumah, j.nama_pengisi, j.jumlah, j.diambil_oleh, (SELECT count(1) FROM rapel r WHERE r.nomor_rumah = j.nomor_rumah AND r.tanggal = j.tanggal) as is_rapel, w.nama as nama_warga FROM jimpitan j LEFT JOIN ref_warga w ON CAST(j.nomor_rumah AS INTEGER) = w.nomor WHERE j.nomor_rumah = ? AND SUBSTR(j.tanggal, 1, 7) = ? ORDER BY j.tanggal ASC",
      [String(nomor_rumah), String(bulan)],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      },
    );
  });
}

module.exports = {
  db,
  ambilSemuaData,
  ambilJimpitanPerBulan,
  hapusDanSimpanJimpitanHarian,
  ambilLaporanHarian,
  simpanRapelHarian,
  ambilRapelHarian,
  ambilRapelBulanan,
  ambilTanggalJimpitanKosong,
  ambilTanggalRapelTerisi,
  ambilPengeluaran,
  ambilStatusJimpitanRumahPerBulan,
  simpanPengeluaran,
  hapusPengeluaran,
  updatePengeluaran,
  simpanTanggalPemutihan,
  ambilTanggalPemutihan,
  hapusTanggalPemutihan,
  simpanRefWarga,
  updateRefWarga,
  ambilRefWarga,
  hapusRefWarga,
};
