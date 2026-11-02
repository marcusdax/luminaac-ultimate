// Add the permissions and usage text background location needs, after `cap add`.
// Idempotent: safe to run after every `cap sync`. Usage: node native-config.mjs [android|ios]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));

export const ANDROID_PERMS = ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "ACCESS_BACKGROUND_LOCATION", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_LOCATION", "POST_NOTIFICATIONS", "RECORD_AUDIO", "CAMERA"];
export function patchManifest(xml) {
  const add = ANDROID_PERMS.filter((p) => !xml.includes(`android.permission.${p}"`)).map((p) => `    <uses-permission android:name="android.permission.${p}" />`);
  if (!add.length) return xml;
  return xml.replace(/(<manifest[^>]*>)/, `$1\n${add.join("\n")}`);
}
export const IOS_KEYS = {
  NSLocationWhenInUseUsageDescription: "LuminAAC checks your family's safe places so they hear when you arrive or leave.",
  NSLocationAlwaysAndWhenInUseUsageDescription: "With this on, safe places keep working when the screen is off. Your family chose this. Location is never sold or shared outside your family.",
  NSMicrophoneUsageDescription: "For sound games and recording a grown-up's voice for a button. Sound stays on this device.",
  NSCameraUsageDescription: "For taking a photo to use as a picture on a button. Photos stay on this device.",
};
export function patchPlist(xml) {
  let out = xml;
  for (const [k, v] of Object.entries(IOS_KEYS)) if (!out.includes(`<key>${k}</key>`)) out = out.replace(/<dict>/, `<dict>\n\t<key>${k}</key>\n\t<string>${v}</string>`);
  if (!out.includes("<key>UIBackgroundModes</key>")) out = out.replace(/<dict>/, `<dict>\n\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>location</string>\n\t</array>`);
  return out;
}
function run(which) {
  if (which !== "ios") {
    const f = join(here, "android/app/src/main/AndroidManifest.xml");
    if (existsSync(f)) { writeFileSync(f, patchManifest(readFileSync(f, "utf8"))); console.log("Patched", f); }
  }
  if (which !== "android") {
    const f = join(here, "ios/App/App/Info.plist");
    if (existsSync(f)) { writeFileSync(f, patchPlist(readFileSync(f, "utf8"))); console.log("Patched", f); }
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) run(process.argv[2]);
