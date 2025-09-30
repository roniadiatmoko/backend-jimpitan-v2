const sqlite3 = require("sqlite3");

const DB_PATH = "./db.sqlite";

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Gagal konek DB:", err);
  } else {
    console.log("SQLite connected:", DB_PATH);
  }
});

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

module.exports = {
  db,
  all,
  get,
  run,
};
