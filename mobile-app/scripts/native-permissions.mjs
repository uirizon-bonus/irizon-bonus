// Re-applies the native permissions the app needs to the generated Android and
// iOS projects.
//
// Those projects are not in git (mobile-app/.gitignore ignores /android and
// /ios), so anything edited inside them is lost whenever they are recreated
// with `npx cap add`. The geolocation plugin ships no manifest entries of its
// own, so without this the delivery-address picker silently gets no GPS.
//
// Idempotent: run it as often as you like. Wired into `npm run cap:sync`.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ANDROID_MANIFEST = resolve(root, "android/app/src/main/AndroidManifest.xml");
const IOS_PLIST = resolve(root, "ios/App/App/Info.plist");

const ANDROID_PERMISSIONS = [
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
];

const IOS_KEYS = [
  [
    "NSLocationWhenInUseUsageDescription",
    "IRIZON uses your location only when you choose your delivery address, so gifts can be delivered to you.",
  ],
];

let changed = 0;

if (existsSync(ANDROID_MANIFEST)) {
  let xml = readFileSync(ANDROID_MANIFEST, "utf8");
  const missing = ANDROID_PERMISSIONS.filter((name) => !xml.includes(name));
  if (missing.length) {
    const lines = missing.map((name) => `    <uses-permission android:name="${name}" />`).join("\n");
    xml = xml.replace("</manifest>", `${lines}\n</manifest>`);
    writeFileSync(ANDROID_MANIFEST, xml);
    console.log(`android: added ${missing.length} permission(s)`);
    changed += missing.length;
  } else {
    console.log("android: permissions already present");
  }
} else {
  console.log("android: project not generated, skipping");
}

if (existsSync(IOS_PLIST)) {
  let plist = readFileSync(IOS_PLIST, "utf8");
  const missing = IOS_KEYS.filter(([key]) => !plist.includes(`<key>${key}</key>`));
  if (missing.length) {
    const entries = missing
      .map(([key, value]) => `\t<key>${key}</key>\n\t<string>${value}</string>`)
      .join("\n");
    // Insert before the final </dict> of the root dictionary.
    const marker = plist.lastIndexOf("</dict>");
    plist = `${plist.slice(0, marker)}${entries}\n${plist.slice(marker)}`;
    writeFileSync(IOS_PLIST, plist);
    console.log(`ios: added ${missing.length} key(s)`);
    changed += missing.length;
  } else {
    console.log("ios: usage descriptions already present");
  }
} else {
  console.log("ios: project not generated, skipping");
}

console.log(changed ? `native permissions updated (${changed})` : "native permissions unchanged");
