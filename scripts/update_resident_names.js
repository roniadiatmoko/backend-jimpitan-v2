const { all, run } = require('../src/db');

const nameMapping = {
  1: "Bp. Hartono",
  2: "Bp. Yuli",
  3: "Bp. Risal",
  4: "Bp. Wahyono",
  5: "Bp. Doni",
  6: "Bp. Ikut P",
  7: "-",
  8: "Bp. Hendra",
  9: "Bp. Bambang",
  10: "Bp. Tri Koesnanto",
  11: "Ibu Herma",
  12: "Ibu Sri Parinem, S.Pd",
  13: "-",
  14: "-",
  15: "Bp. Eko",
  16: "Bp. Farid",
  17: "-",
  18: "Ibu Rini",
  19: "Bp. Adi Pamungkas",
  20: "Bp. Roni - Ibu Nurul",
  21: "Bp. Eka Yudha T",
  22: "Ibu Ineke",
  23: "-",
  24: "Bp. Andhika",
  25: "Bp. Nugroho",
  26: "Bp. Agus",
  27: "-",
  28: "Bp. Ade Tri Setiawan",
  29: "Bp. Joni",
  30: "Bp. Wahyu Sutejo",
  31: "Bp. Amri",
  32: "Bp. Dedy",
  33: "Bp. Roni Adiatmoko",
  34: "-",
  35: "Bp. Sinyo / Aang",
  36: "-",
  37: "Bp. Ulil",
  38: "Ibu Adinda",
  39: "Bp. Boby",
  40: "Bp. Hari",
  41: "-",
  42: "-",
  43: "Bp. Topik",
  44: "Bp. Wahyu Pratama",
  45: "-",
  46: "-",
  47: "-",
  48: "-",
  49: "Bp. Ilham",
  50: "Bp. Hafidz",
  51: "Bp. Koko",
  52: "Bp. Tri / Yudi",
  53: "Bp. Anwar",
  54: "Bp. Okta",
  55: "-",
  56: "-",
  57: "-",
  58: "-",
  59: "Ibu Pitaloka",
  60: "Bp. Tri",
  61: "Bp. Royhan",
  62: "Bp. Samsino",
  63: "Bp. Kasto",
  64: "Bp. Wahyu Hidayat",
  65: "Bp. Yahya",
  66: "Bp. Endro",
  67: "Bp. Endra",
  68: "Bp. Ikhwan",
};

(async () => {
  console.log("Memulai update nama warga di ref_warga...");

  let updatedCount = 0;
  for (const [nomorStr, newNama] of Object.entries(nameMapping)) {
    const nomor = Number(nomorStr);
    await run("UPDATE ref_warga SET nama = ? WHERE nomor = ?", [newNama, nomor]);
    updatedCount++;
  }

  console.log(`Berhasil mengupdate ${updatedCount} baris di ref_warga.`);

  // Ambil semua data untuk verifikasi
  const allRows = await all("SELECT nomor, nama, sudah_menghuni, no_hp FROM ref_warga ORDER BY CAST(nomor AS INTEGER) ASC");
  console.log("\n=== DAFTAR NAMA WARGA TERBARU (68 RUMAH) ===");
  console.table(allRows.map(r => ({ nomor: r.nomor, nama: r.nama, status: r.sudah_menghuni === 1 ? 'Menghuni' : 'Belum', hp: r.no_hp || '-' })));
})();
