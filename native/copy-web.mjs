// Copies the web app into www/ and adds the native bridge script to My Voice.
// Run from native/: node copy-web.mjs
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
const SKIP = new Set(["native", "backend", "screenshots", "tests", ".git", "node_modules"]);
rmSync("www", { recursive: true, force: true }); mkdirSync("www");
cpSync("..", "www", { recursive: true, filter: (src) => { const top = src.replace(/^\.\.\/?/, "").split("/")[0]; return !SKIP.has(top) && !src.endsWith(".zip") && !src.endsWith(".md"); } });
cpSync("src/native-geofence.js", "www/native-geofence.js");
for (const page of ["index.html", "bridge.html"]) {
  const f = `www/${page}`; let html = readFileSync(f, "utf8");
  if (!html.includes("native-geofence.js")) html = html.replace("</body>", '  <script type="module" src="native-geofence.js"></script>\n</body>');
  writeFileSync(f, html);
}
console.log("Copied the web app to native/www");
