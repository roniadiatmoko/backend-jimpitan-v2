// db.js

const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db.sqlite");
const { format, lastDayOfMonth } = require("date-fns");
const { id } = require("date-fns/locale");

// Buat tabel jika belum ada
db.serialize(() => {
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
    `)

  //table tanggal pemutihan
  db.run(`
    CREATE TABLE IF NOT EXISTS tanggal_pemutihan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT,
      keterangan TEXT,
      created_at TEXT
    )
  `)
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
            stmt.finalize();
            resolve();
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
    stmt.run([nomor_rumah, tanggal], (err) => {
      if (err) reject(err);
      else resolve();
    });
    stmt.finalize();
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
      "SELECT nomor_rumah, count(1) as jumlah_rapel, count(1) * 500 nominal FROM rapel WHERE SUBSTR(tanggal, 1, 7) = ? GROUP BY nomor_rumah ORDER BY nomor_rumah",
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

//ambil pengeluaran yyyy-mm
function ambilPengeluaran(bulan){
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * from pengeluaran WHERE SUBSTR(tanggal, 1, 7) = ? ORDER BY tanggal ASC",
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
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    )
  })
}

function hapusPengeluaran(id) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM pengeluaran WHERE id = ?", [id], function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

// --- TANGGAL PEMUTIHAN HELPERS ---
function simpanTanggalPemutihan(tanggal, keterangan) {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    db.run(
      "INSERT INTO tanggal_pemutihan (tanggal, keterangan, created_at) VALUES (?, ?, ?)",
      [tanggal, keterangan, createdAt],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
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
      resolve(this.changes);
    });
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
  simpanPengeluaran,
  hapusPengeluaran,
};
