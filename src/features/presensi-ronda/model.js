const { db } = require("../../../db");
const { enqueueMirror, withTransaction } = require("../../utils/postgresMirror");

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
        db.all(
          "SELECT id, tanggal, nomor_rumah, nama_penghuni, waktu_input FROM presensi_ronda WHERE tanggal = ? ORDER BY id",
          [tanggalStr],
          (readError, rows) => {
            if (readError) return reject(readError);
            enqueueMirror(`presensi ronda ${tanggalStr}`, (pool) =>
              withTransaction(pool, async (client) => {
                await client.query(
                  "DELETE FROM presensi_ronda WHERE tanggal = $1",
                  [tanggalStr],
                );
                for (const row of rows) {
                  await client.query(
                    "INSERT INTO presensi_ronda (id, tanggal, nomor_rumah, nama_penghuni, waktu_input) VALUES ($1, $2, $3, $4, $5)",
                    [
                      row.id,
                      row.tanggal,
                      row.nomor_rumah,
                      row.nama_penghuni,
                      row.waktu_input,
                    ],
                  );
                }
              }),
            );
            resolve({
              tanggal: tanggalStr,
              homes,
            });
          },
        );
      });
    });
  });
}

function deletePersonilById(id) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM presensi_ronda WHERE id = ?", [id], (err) => {
      if (err) reject(err);
      else {
        enqueueMirror(`hapus presensi ronda ${id}`, (pool) =>
          pool.query("DELETE FROM presensi_ronda WHERE id = $1", [id]),
        );
        resolve();
      }
    });
  });
}


module.exports = {
  savePresensiRonda,
  getPresensiRondaByTanggal,
  deletePersonilById
};
