// Builds the Chrome Web Store zip: copies extension/ without docs and removes the
// localhost permission (only needed while developing) from the manifest.
// Usage: npm run package:extension  ->  viewlens-<version>.zip in the Frontend folder
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const source = resolve("extension");
const work = mkdtempSync(join(tmpdir(), "viewlens-"));
cpSync(source, work, { recursive: true, filter: (path) => !path.endsWith(".md") && !path.endsWith(".DS_Store") });

const manifestPath = join(work, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.host_permissions = manifest.host_permissions.filter((url) => !/localhost|127\.0\.0\.1/.test(url));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const zipPath = resolve(`viewlens-${manifest.version}.zip`);
rmSync(zipPath, { force: true });
execFileSync("zip", ["-qr", zipPath, "."], { cwd: work });
rmSync(work, { recursive: true, force: true });
console.log(`Created ${zipPath}`);
console.log(`Server: ${manifest.host_permissions.join(", ")}`);
