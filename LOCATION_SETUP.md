# Delivery location — setup and operation

Customers pick a delivery address in the app; each gift request keeps a copy of
that address, and operators open it on a map from the admin panel.

## It already works without Google

Nothing here blocks a release. With no keys configured:

- the customer presses **«Моё местоположение»**, the phone's GPS sets the pin;
- they type the address themselves;
- the request carries the address, the note and the coordinates;
- the admin panel shows all of it, and its "open in maps" link works (that link
  is a plain google.com/maps URL and costs nothing).

What the keys add: a draggable map, and the address filled in automatically from
the pin.

## 1. Google Cloud project

1. Sign in at <https://console.cloud.google.com> and create a project, e.g.
   `irizon-bonus-maps`.
2. **Billing → Link a billing account.** Nothing works without it: every call
   comes back `REQUEST_DENIED — You must enable Billing on the Google Cloud
   Project`, whatever else is configured. Google's free monthly allowance still
   applies once billing is attached.
3. **APIs & Services → Enable APIs**, enable exactly these three:
   - **Maps JavaScript API** — the map inside the app
   - **Geocoding API** — pin to address
   - **Places API (New)** — address search box. Pick the entry named "(New)":
     projects created recently cannot enable the older Places API, and calling
     it returns `You're calling a legacy API, which is not enabled for your
     project`. The server uses the new one.

## 2. Two keys, never one

A key inside the app can be read by anyone who downloads it, so the billable
lookups use a separate key that never leaves the server.

**Key A — "app map key"** (goes into the app build)
- Application restrictions → **Android apps**: package `com.irizon.bonus` plus
  the SHA-1 of the signing certificate (`keytool -list -v -keystore <your.keystore>`).
- Add an **iOS apps** entry as well: bundle id `com.irizon.bonus`.
- API restrictions → **Maps JavaScript API only**.

**Key B — "server key"** (goes into the server `.env`)
- Application restrictions → **IP addresses**: `178.104.56.36`.
- API restrictions → **Geocoding API** and **Places API** only.

### Using a single key for now

One key can serve both sides while you are getting started, but leave it
**unrestricted** and it can be lifted out of the app bundle and spent by anyone.
The two restrictions are mutually exclusive on one key — an IP restriction locks
the app out, an app restriction locks the server out — so a single key means no
restrictions at all. Treat that as temporary, keep the quota caps low, and split
it into key A and key B before the app reaches a wide audience.

## 3. Where the keys go

Server — `/opt/irizon-backend/irizon-bonus-v0.1/.env`, then
`sudo systemctl restart irizon-bonus-api2 irizon-bonus-api`:

```
GOOGLE_MAPS_SERVER_KEY=<key B>
```

App — set before building the mobile app:

```
VITE_GOOGLE_MAPS_KEY=<key A>
```

Never commit either key.

## 4. Spending controls

Set these the same day you enable billing:

- **Budget alert:** Billing → Budgets & alerts → e.g. $20/month, alert at 50/90/100%.
- **Quota caps:** APIs & Services → each API → Quotas → cap requests per day.
  A few thousand a day is plenty for this app.

The app is built to keep calls low: the map script loads only when the picker is
open, the address lookup runs when the pin stops moving rather than during
dragging, answers are cached on the server by rounded coordinates, and address
search waits for three characters and uses one billing session per search.

## 5. Other settings (server `.env`)

| Setting | Default | What it does |
|---|---|---|
| `REQUIRE_DELIVERY_ADDRESS` | `true` | Gifts are delivered, so a customer request needs an address. Set `false` to let requests through without one. |
| `GEO_BBOX_ENFORCED` | `true` | Refuse pins outside Uzbekistan as mistakes. |
| `GEO_LAT_MIN` / `GEO_LAT_MAX` / `GEO_LNG_MIN` / `GEO_LNG_MAX` | 37.0 / 45.7 / 55.9 / 73.2 | The accepted area. |
| `GEOCODE_CACHE_TTL_DAYS` | `90` | How long a cached address stays valid. |

## 6. Building the app

```bash
cd mobile-app
npm run cap:sync        # builds, syncs Android, re-applies native permissions
```

`cap:sync` runs `scripts/native-permissions.mjs`, which puts the location
permission back into `android/` and `ios/`. Those folders are not in git, so
after `npx cap add android` or `npx cap add ios` on a new machine, run it again
(`npm run native:permissions`) or the picker gets no GPS.

For iOS: `npx cap sync ios && npm run native:permissions`, then open the project
in Xcode.

## 7. Before the store release

- **Play Console → Data safety:** declare that approximate and precise location
  are collected, used for "App functionality" (delivery), not shared, and
  collected only in use.
- **App Store Connect → App Privacy:** add "Precise Location", linked to the
  user's account, used for App Functionality.
- **In-app legal pages** (`/legal/:type`): say that location is used to deliver
  gifts, is taken only while the customer opens the address picker, and is never
  collected in the background.
