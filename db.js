// db.js

const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./db.sqlite");

// Buat tabel jika belum ada
db.serialize(() => {
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

// FUNGSI BARU: Mengambil laporan harian berdasarkan tanggal
function ambilLaporanHarian(tanggal) {
  return new Promise((resolve, reject) => {
    // Mengambil semua data untuk tanggal yang spesifik
    db.all(
      "SELECT nomor_rumah, nama_pengisi, jumlah FROM jimpitan WHERE tanggal = ? ORDER BY nomor_rumah ASC",
      [tanggal],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const totalTerisi = rows.filter((row) => row.jumlah === 1).length;
          const totalTidakTerisi = rows.filter(
            (row) => row.jumlah === 0,
          ).length;
          const totalUang = totalTerisi * 500;

          // Mengemas data menjadi format yang lebih rapi untuk laporan
          const laporan = rows.map((row) => ({
            nomor_rumah: row.nomor_rumah,
            nama_pengisi: row.nama_pengisi,
            status_terisi: row.jumlah === 1 ? "Terisi" : "Kosong",
          }));

          resolve({
            tanggal: tanggal,
            laporan: laporan,
            totalTerisi: totalTerisi,
            totalTidakTerisi: totalTidakTerisi,
            totalUang: totalUang,
          });
        }
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

module.exports = {
  db,
  ambilSemuaData,
  hapusDanSimpanJimpitanHarian,
  ambilLaporanHarian, // Ekspor fungsi baru
};
