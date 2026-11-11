const { db } = require("../../../db");
const { enqueueMirror, withTransaction } = require("../../utils/postgresMirror");

function getNamaHariIndo(tanggalStr) {
  if (!tanggalStr) return "Senin";
  try {
    const hariArr = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const d = new Date(tanggalStr + "T12:00:00+07:00");
    return hariArr[d.getDay()] || "Senin";
  } catch {
    return "Senin";
  }
}

function getPresensiRondaByTanggal(tanggal) {
  return new Promise((resolve, reject) => {
    const tanggalStr = String(tanggal).slice(0, 10);

    db.all(
      "SELECT * FROM presensi_ronda WHERE tanggal = ? ORDER BY CAST(nomor_rumah AS INTEGER) ASC",
      [tanggalStr],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

function savePresensiRonda(tanggal, homes = []) {
  return new Promise((resolve, reject) => {
    const tanggalStr = String(tanggal).slice(0, 10);

    db.serialize(() => {
      // Hapus presensi lama tanggal tersebut agar sinkron dengan personil yang hadir saat ini
      db.run("DELETE FROM presensi_ronda WHERE tanggal = ?", [tanggalStr], (delErr) => {
        if (delErr) console.warn("[savePresensiRonda] Warn delete:", delErr.message);

        if (!homes || homes.length === 0) {
          enqueueMirror(`presensi ronda kosong ${tanggalStr}`, (pool) =>
            pool.query("DELETE FROM presensi_ronda WHERE tanggal = $1", [tanggalStr])
          );
          return resolve({ tanggal: tanggalStr, homes: [] });
        }

        const stmt = db.prepare(
          "INSERT OR IGNORE INTO presensi_ronda (tanggal, nomor_rumah, nama_penghuni) VALUES (?, ?, ?)"
        );

        homes.forEach((item) => {
          stmt.run([tanggalStr, String(item.nomor_rumah), item.nama_penghuni || ""]);
        });

        stmt.finalize((err) => {
          if (err) return reject(err);
          db.all(
            "SELECT id, tanggal, nomor_rumah, nama_penghuni, waktu_input FROM presensi_ronda WHERE tanggal = ? ORDER BY CAST(nomor_rumah AS INTEGER) ASC",
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
                homes: rows,
              });
            },
          );
        });
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

// Master Jadwal Ronda Mingguan
function getJadwalRondaByHari(hari) {
  return new Promise((resolve, reject) => {
    let query = "SELECT * FROM jadwal_petugas_ronda";
    const params = [];
    if (hari) {
      query += " WHERE hari = ?";
      params.push(hari);
    }
    query += " ORDER BY CASE hari WHEN 'Senin' THEN 1 WHEN 'Selasa' THEN 2 WHEN 'Rabu' THEN 3 WHEN 'Kamis' THEN 4 WHEN 'Jumat' THEN 5 WHEN 'Sabtu' THEN 6 WHEN 'Minggu' THEN 7 ELSE 8 END, CAST(nomor_rumah AS INTEGER) ASC";

    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function savePersonilJadwal({ hari, nomor_rumah, nama_penghuni }) {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT OR REPLACE INTO jadwal_petugas_ronda (hari, nomor_rumah, nama_penghuni) VALUES (?, ?, ?)",
      [hari, String(nomor_rumah), nama_penghuni || ""],
      function (err) {
        if (err) return reject(err);
        const lastID = this.lastID;
        enqueueMirror(`jadwal ronda insert ${lastID}`, (pool) => {
          return pool.query(
            `INSERT INTO "jadwal_petugas_ronda" (hari, nomor_rumah, nama_penghuni)
             VALUES ($1, $2, $3)
             ON CONFLICT (hari, nomor_rumah) DO UPDATE SET nama_penghuni = EXCLUDED.nama_penghuni`,
            [hari, String(nomor_rumah), nama_penghuni || ""]
          );
        });
        resolve({ id: lastID, hari, nomor_rumah, nama_penghuni });
      }
    );
  });
}

function deletePersonilJadwal(id) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM jadwal_petugas_ronda WHERE id = ?", [id], (err) => {
      if (err) return reject(err);
      enqueueMirror(`jadwal ronda delete ${id}`, (pool) => {
        return pool.query(`DELETE FROM "jadwal_petugas_ronda" WHERE id = $1`, [id]);
      });
      resolve();
    });
  });
}

async function getPresensiOrJadwalByTanggal(tanggal) {
  const tanggalStr = String(tanggal).slice(0, 10);
  const namaHari = getNamaHariIndo(tanggalStr);

  const existingPresensi = await getPresensiRondaByTanggal(tanggalStr);

  if (existingPresensi && existingPresensi.length > 0) {
    return {
      tanggal: tanggalStr,
      hari: namaHari,
      isSaved: true,
      data: existingPresensi,
    };
  }

  // Jika belum ada data tersimpan untuk tanggal ini, ambil jadwal default hari tersebut
  const jadwalHari = await getJadwalRondaByHari(namaHari);
  return {
    tanggal: tanggalStr,
    hari: namaHari,
    isSaved: false,
    isDefaultJadwal: true,
    data: jadwalHari.map((j) => ({
      nomor_rumah: j.nomor_rumah,
      nama_penghuni: j.nama_penghuni,
      is_default_jadwal: true,
    })),
  };
}

module.exports = {
  savePresensiRonda,
  getPresensiRondaByTanggal,
  deletePersonilById,
  getJadwalRondaByHari,
  savePersonilJadwal,
  deletePersonilJadwal,
  getPresensiOrJadwalByTanggal,
  getNamaHariIndo,
};
