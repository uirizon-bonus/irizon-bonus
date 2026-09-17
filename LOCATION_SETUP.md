# Delivery location — setup and operation

Customers pick a delivery address in the app; each gift request keeps a copy of
that address, and operators open it on a map from the admin panel.

Address lookups go through **Yandex Maps**, which has better street-level data
for Uzbekistan than the alternatives. The provider is a setting, not a rewrite:
`GEO_PROVIDER=google` switches the server back to Google (see the last section).

## It already works without any keys

Nothing here blocks a release. With no keys configured:

- the customer presses **«Моё местоположение»**, the phone's GPS sets the pin;
- they type the address themselves;
- the request carries the address, the note and the coordinates;
- the admin panel shows all of it, and its "open in maps" link works (that link
  is a plain yandex.uz/maps URL and costs nothing).

What the keys add: a draggable map, address search, and the address filled in
automatically from the pin.

## 1. Get the Yandex keys

Go to the **Yandex Maps API developer dashboard**
(<https://developer.tech.yandex.ru/services>) and create keys for two services:

| Service to pick | Covers | Goes into |
|---|---|---|
| **JavaScript API and Geocoder HTTP API** | the map in the app **and** pin→address on the server | `VITE_YANDEX_MAPS_KEY` (app) and `YANDEX_GEOCODER_KEY` (server) |
| **Geosuggest API** | the address search box | `YANDEX_SUGGEST_KEY` (server) |

Yandex issues a separate key per service, so expect two keys. Check the current
free limits and commercial terms on the dashboard before launch — the free tier
carries conditions about non-commercial use.

**If you restrict the JS key by referer**, allow the origins a Capacitor app
actually uses — `capacitor://localhost`, `http://localhost`, `https://localhost`
— or the map will refuse to load on phones while working fine in a browser.

The geocoder and suggest keys are only ever used from the server, so restrict
them to the server IP `178.104.56.36` where the dashboard allows it.

## 2. Where the keys go

Server — `/opt/irizon-backend/irizon-bonus-v0.1/.env`, then
`sudo systemctl restart irizon-bonus-api2 irizon-bonus-api`:

```
GEO_PROVIDER=yandex
YANDEX_GEOCODER_KEY=<JavaScript API and Geocoder key>
YANDEX_SUGGEST_KEY=<Geosuggest key>
```

App — `mobile-app/irizon-mobile-ui/.env.production` (git-ignored), read at build
time:

```
VITE_YANDEX_MAPS_KEY=<JavaScript API and Geocoder key>
```

Never commit either key.

## 3. Keeping the bill small

The app is built to keep calls low: the map script loads only when the picker is
open, the address lookup runs once the pin stops moving rather than during
dragging, answers are cached on the server by rounded coordinate
(`GEOCODE_CACHE_TTL_DAYS`, default 90), and address search waits for three
characters. Set whatever daily limits the dashboard offers.

## 4. Other settings (server `.env`)

| Setting | Default | What it does |
|---|---|---|
| `GEO_PROVIDER` | `yandex` | `yandex` or `google`. |
| `REQUIRE_DELIVERY_ADDRESS` | `true` | Gifts are delivered, so a customer request needs an address. Set `false` while older app builds without the picker are still in use. |
| `GEO_BBOX_ENFORCED` | `true` | Refuse pins outside Uzbekistan as mistakes. |
| `GEO_LAT_MIN` / `GEO_LAT_MAX` / `GEO_LNG_MIN` / `GEO_LNG_MAX` | 37.0 / 45.7 / 55.9 / 73.2 | The accepted area. |
| `GEOCODE_CACHE_TTL_DAYS` | `90` | How long a cached address stays valid. |

## 5. Building the app

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

## 6. Before the store release

- **Play Console → Data safety:** declare that approximate and precise location
  are collected, used for "App functionality" (delivery), not shared, and
  collected only in use.
- **App Store Connect → App Privacy:** add "Precise Location", linked to the
  user's account, used for App Functionality.
- **In-app legal pages** (`/legal/:type`): say that location is used to deliver
  gifts, is taken only while the customer opens the address picker, and is never
  collected in the background.

## 7. Switching back to Google

The server keeps a full Google implementation. Set on the server:

```
GEO_PROVIDER=google
GOOGLE_MAPS_SERVER_KEY=<server key, restricted to 178.104.56.36>
```

Enable **Maps JavaScript API**, **Geocoding API** and **Places API (New)** —
the "(New)" one; recent projects cannot enable the older Places endpoints — and
attach a billing account, or every call returns `REQUEST_DENIED`. The app's map
would then need the Google SDK again; only the server side switches by setting.
