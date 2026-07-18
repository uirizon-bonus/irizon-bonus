# IRIZON Mobile App (Capacitor)

## 1) Configure API

Edit `irizon-mobile-ui/.env`:

```env
VITE_API_BASE_URL="https://your-backend-domain-or-tunnel"
VITE_API_TIMEOUT_MS=20000
```

Notes:
- For local browser dev you can keep `VITE_API_BASE_URL=""` and use Vite proxy.
- For APK/mobile build, `VITE_API_BASE_URL` must be set to a real backend URL.

## 2) Run in browser (dev)

```bash
npm run dev
```

## 3) Sync web build to Android

```bash
npm run cap:sync
```

## 4) Open Android Studio

```bash
npm run cap:open:android
```

## 5) Build APK from terminal

Debug APK:

```bash
npm run apk:debug
```

Release APK:

```bash
npm run apk:release
```

APK output path:
- `android/app/build/outputs/apk/debug/app-debug.apk`
- `android/app/build/outputs/apk/release/app-release.apk`
