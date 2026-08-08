# IRIZON — Server & Deployment Guide

Production server: **`root@185.217.131.71`** (`vps08096.eskiz.uz`), Ubuntu 22.04.
Web server: **nginx** (TLS via Certbot). Python backends run under **systemd**; the
Node dashboard runs under **pm2**.

> ⚠️ Secrets (`.env`, `firebase-service-account.json`) and the virtualenv (`venv/`)
> are **not** in git. They live only on the server and must be preserved across updates.

---

## 1. What runs where (service → repo → port → domain)

| systemd service | Domain | Port | Directory | ASGI app | GitHub repo | User |
|---|---|---|---|---|---|---|
| **`irizon-bonus-api`** | **api.irizon.uz** | 8006 | `/opt/irizon-backend/irizon-bonus-v0.1` | `clients_api:app` | **`uirizon-bonus/irizon-bonus`** | root |
| `irizon-bonus-api2` | *(internal)* | 8007 | `/opt/irizon-backend/irizon-bonus-v0.1` | `app:app` | `uirizon-bonus/irizon-bonus` | root |
| `irizon-api` | abc.irizon.uz + catch‑all | 8080 | `/var/www/irizon-abc-github/irizon-abc-github` | `app:app` | `abdukarimmirzayev48-cmyk/irizon-abc-github` | root |
| `irizon-backend` | api.megalmaz.uz | 8000 | `/var/www/irizon-bonus` | `clients_api:app` | `abdukarimmirzayev48-cmyk/irizon-bonus` | www-data |

**Your mobile app + admin backend = `irizon-bonus-api` (api.irizon.uz, :8006), from `uirizon-bonus/irizon-bonus`.**
`irizon-bonus-api2` (:8007) shares the **same folder** but runs the legacy standalone `app:app`, so
updating that folder affects **both** services — restart both after a deploy.

### Frontends / static
| What | Served by | Location |
|---|---|---|
| irizon.uz / www.irizon.uz | nginx static | `/var/www/irizon.uz` (no git) |
| abc.irizon.uz | nginx static + proxy :8080 | `/var/www/irizon-abc-github/irizon-abc-github/dist` |
| Dashboard (`http://185.217.131.71`) | pm2 → :3000 | `/root/irizon/irizon-category-b` (`server.js`) |

---

## 2. Update `api.irizon.uz` from GitHub (the common task)

Repo: `uirizon-bonus/irizon-bonus` → dir `/opt/irizon-backend/irizon-bonus-v0.1`.

```bash
cd /opt/irizon-backend/irizon-bonus-v0.1

# pull latest code (reset --hard is robust; it only touches git-tracked files,
# so .env, venv/ and the DB — all untracked — are left intact)
git fetch origin main
git reset --hard origin/main

# install any new Python deps (no-op if unchanged)
./venv/bin/pip install -r requirements.txt

# restart BOTH services that use this folder
systemctl restart irizon-bonus-api irizon-bonus-api2

# verify
systemctl is-active irizon-bonus-api irizon-bonus-api2
curl -s -o /dev/null -w "local  8006=%{http_code}\n" http://127.0.0.1:8006/docs
curl -s -o /dev/null -w "public      =%{http_code}\n" https://api.irizon.uz/docs
```

> A plain `git pull` also works **as long as** the repo keeps a normal linear history.
> If a fresh/rewritten snapshot is ever pushed (unrelated history), `git pull` errors —
> use the `fetch` + `reset --hard` form above.

Updating the other backends is identical — just `cd` into that service's directory
(see the table) and restart that service.

---

## 3. Service operations (systemd)

```bash
# status / restart / stop / start  (service = irizon-bonus-api | irizon-bonus-api2 | irizon-api | irizon-backend)
systemctl status  irizon-bonus-api
systemctl restart irizon-bonus-api
systemctl stop    irizon-bonus-api
systemctl start   irizon-bonus-api

# live logs
journalctl -u irizon-bonus-api -f
journalctl -u irizon-bonus-api -n 100 --no-pager

# show the unit (WorkingDirectory / ExecStart / EnvironmentFile)
systemctl cat irizon-bonus-api

# dashboard (pm2)
pm2 ls
pm2 restart irizon-dashboard
pm2 logs irizon-dashboard
```

---

## 4. Rollback (api.irizon.uz)

Each deploy via the folder-swap method leaves a timestamped backup. To roll back:

```bash
cd /opt/irizon-backend
systemctl stop irizon-bonus-api irizon-bonus-api2
mv irizon-bonus-v0.1 irizon-bonus-v0.1.bad
mv irizon-bonus-v0.1.old-<TIMESTAMP> irizon-bonus-v0.1     # ls to find the timestamp
systemctl start irizon-bonus-api irizon-bonus-api2
```

Or restore from the tarball: `tar xzf irizon-bonus-v0.1.backup-<TS>.tar.gz`.
When a deploy is confirmed healthy, delete old backups to reclaim space:
`rm -rf irizon-bonus-v0.1.old-* *.backup-*.tar.gz`.

---

## 5. First-time / fresh setup of the backend

```bash
cd /opt/irizon-backend
git clone https://github.com/uirizon-bonus/irizon-bonus.git irizon-bonus-v0.1
cd irizon-bonus-v0.1

# create the two secret files (NOT in git):
#   .env                          — copy from .env.example and fill real values
#   firebase-service-account.json — the Firebase Admin key
cp .env.example .env && nano .env
nano firebase-service-account.json     # paste the service-account JSON

# python env
python3 -m venv venv
./venv/bin/pip install -r requirements.txt

# systemd unit (example for the main API on :8006)
cat >/etc/systemd/system/irizon-bonus-api.service <<'UNIT'
[Unit]
Description=IRIZON BONUS API
After=network.target

[Service]
User=root
WorkingDirectory=/opt/irizon-backend/irizon-bonus-v0.1
EnvironmentFile=/opt/irizon-backend/irizon-bonus-v0.1/.env
ExecStart=/opt/irizon-backend/irizon-bonus-v0.1/venv/bin/python -m uvicorn clients_api:app --host 127.0.0.1 --port 8006 --access-log --log-level info
Restart=always

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now irizon-bonus-api
```

nginx proxies `api.irizon.uz` → `http://127.0.0.1:8006`
(`/etc/nginx/sites-available/api.irizon.uz`). After nginx edits:
`nginx -t && systemctl reload nginx`.

---

## 6. Environment / secrets (`.env`)

- Lives at `<service-dir>/.env`, loaded by systemd via `EnvironmentFile=`.
- `DATABASE_URL` = Supabase Postgres → the app uses Postgres (no local SQLite in prod).
- Key vars: `DATABASE_URL`, `ADMIN_API_KEY`, `OTP_PROVIDER` (`eskiz`|`mock`),
  `ESKIZ_SMS_TOKEN`, `ESKIZ_SMS_FROM`, `OTP_SIGNING_SECRET`, `SMARTUP_LOGIN/PASSWORD`,
  `FIREBASE_SERVICE_ACCOUNT`, `CORS_ALLOW_ORIGINS`.
- After editing `.env`: `systemctl restart irizon-bonus-api irizon-bonus-api2`.
- The **Eskiz token expires ~every 30 days** — refresh it in `.env` when SMS OTP stops
  delivering (`POST https://notify.eskiz.uz/api/auth/login` with email+password → `data.token`).

---

## 7. Mobile app / admin panel builds (from the same repo)

- **Admin panel** (root of repo): `npm install && npm run build` → static `dist/`.
- **Mobile app** (`mobile-app/`): `npm run build && npx cap sync android|ios`, then build
  the APK (`cd android && ./gradlew assembleDebug`) or open Xcode (`npx cap open ios`).
- Mobile API target is baked in at build time via `mobile-app/irizon-mobile-ui/.env`
  → `VITE_API_BASE_URL=https://api.irizon.uz`.
