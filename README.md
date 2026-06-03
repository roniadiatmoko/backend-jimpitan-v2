# backend-jimpitan
Backend Jimpitan | Node JS | Baileys WhatsApp

## Prerequisites

- Node.js (v16+ recommended)
- npm

## Install

1. Install dependencies:

```bash
npm install
```

## Configuration

Create a `.env` file in the project root (optional values shown):

```
PORT=3000
GROUP_ID=1203630xxxxxxxxxxx@g.us
GROUP_ID_TESTING=1203630xxxxxxxxxxx@g.us
```

Notes:
- `GROUP_ID` and `GROUP_ID_TESTING` are used by the WhatsApp bot to send reports.
- The app uses `./db.sqlite` (SQLite) and will create it automatically.
- WhatsApp session files are stored in the `baileys_auth_info` folder — keep it writable.

## Run (development)

```bash
npm run dev
```

## Run (production)

```bash
npm start
```

## WhatsApp bot

- The WhatsApp bot is started on-demand (first `POST /api/jimpitan` or when calling `/api/tes-wa`, `/api/kirim-laporan-jimpitan/:tanggal`).
- When starting for the first time, a QR will be printed to the terminal. You can also visit `http://0.0.0.0:PORT/qr` to view the latest QR image while the bot is starting.
- To reset the WhatsApp session, remove the `baileys_auth_info` directory and restart the bot to re-scan the QR.

## Useful endpoints

- `GET /` — health message
- `GET /ping` — uptime ping
- `GET /api/jimpitan` — list all jimpitan data
- `POST /api/jimpitan` — save jimpitan (requires `secret_key: "rahasiakita123"` in request body)
- `GET /api/laporan/:tanggal` — get daily report (format `YYYY-MM-DD`)

## Troubleshooting

- If the bot doesn't show a QR, ensure `baileys_auth_info` is writable and `GROUP_ID` env vars are set correctly.
- SQLite database file `db.sqlite` is created in the project root. Ensure the process has write permissions.

---
Small and quick: start with `npm install` then `npm run dev`.
