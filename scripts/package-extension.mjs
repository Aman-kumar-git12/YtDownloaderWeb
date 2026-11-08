// Builds the extension zip: copies extension/ without docs (and drops any localhost
// permission, in case one is added while developing).
// Usage: npm run package:extension  ->  extension/viewlens.zip (the only zip kept)
// Upload it to the GitHub release so the "latest/download/viewlens.zip" link keeps working.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const source = resolve("extension");
const work = mkdtempSync(join(tmpdir(), "viewlens-"));
// Leave out docs, macOS files and old zips (a zip must never end up inside the next zip)
cpSync(source, work, { recursive: true, filter: (path) => !/\.(md|zip)$|\.DS_Store$/.test(path) });

const manifestPath = join(work, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.host_permissions = manifest.host_permissions.filter((url) => !/localhost|127\.0\.0\.1/.test(url));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// Remove older builds (in Frontend/ and extension/) so only the newest zip remains
for (const dir of [resolve("."), source]) {
  for (const name of readdirSync(dir)) {
    if (/^viewlens.*\.zip$/.test(name)) rmSync(join(dir, name), { force: true });
  }
}
const zipPath = join(source, "viewlens.zip");
execFileSync("zip", ["-qr", zipPath, "."], { cwd: work });
rmSync(work, { recursive: true, force: true });
console.log(`Created ${zipPath} (version ${manifest.version}); upload it to the GitHub release`);
console.log(`Hosts: ${manifest.host_permissions.join(", ")}`);
