const { db } = require("../../../db");

function getPresensiRondaByTanggal(tanggal) {
  return new Promise((resolve, reject) => {
    const tanggalStr = String(tanggal).slice(0, 10);

    db.all(
      "SELECT * FROM presensi_ronda WHERE tanggal = ? ORDER BY nomor_rumah ASC",
      [tanggalStr],
      (err, rows) => {
        console.log(
          "[getPresensiRondaByTanggal] callback dipanggil. err =",
          err,
          "rows =",
          rows
        );
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function savePresensiRonda(tanggal, homes) {
  return new Promise((resolve, reject) => {
    const tanggalStr = String(tanggal).slice(0, 10);

    db.serialize(() => {
      const stmt = db.prepare(
        "INSERT OR IGNORE INTO presensi_ronda (tanggal, nomor_rumah, nama_penghuni) VALUES (?, ?, ?)"
      );

      homes.forEach((item) => {
        stmt.run([tanggalStr, item.nomor_rumah, item.nama_penghuni]);
      });

      stmt.finalize((err) => {
        if (err) return reject(err);
        resolve({
          tanggal: tanggalStr,
          homes,
        });
      });
    });
  });
}

function deletePersonilById(id) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM presensi_ronda WHERE id = ?", [id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}


module.exports = {
  savePresensiRonda,
  getPresensiRondaByTanggal,
  deletePersonilById
};
