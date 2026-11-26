// Applies the "Cut last 5s" mod to the installed CompHero.
// Usage: node install.mjs            (apply)
//        node install.mjs --restore  (put the original files back)
// Re-run after CompHero auto-updates, since an update replaces the files.
import * as asar from "@electron/asar";
import * as ResEdit from "resedit";
import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const install = path.join(process.env.LOCALAPPDATA, "Programs", "CompHero");
const asarPath = path.join(install, "resources", "app.asar");
const exePath = path.join(install, "CompHero.exe");
const backup = path.join(here, "backup");

const running = execFileSync("tasklist", ["/FI", "IMAGENAME eq CompHero.exe"]).toString();
if (running.includes("CompHero.exe")) {
  console.error("Close CompHero first.");
  process.exit(1);
}

if (process.argv.includes("--restore")) {
  fs.copyFileSync(path.join(backup, "app.asar"), asarPath);
  fs.copyFileSync(path.join(backup, "CompHero.exe"), exePath);
  console.log("Restored original CompHero.");
  process.exit(0);
}

// Back up the current (unmodded) install. Refresh the backup when CompHero has updated.
const version = JSON.parse(asar.extractFile(asarPath, "package.json").toString()).version;
const bundleName = asar.listPackage(asarPath).find(p => /out[\\/]renderer[\\/]assets[\\/]index-.*\.js$/.test(p));
const current = asar.extractFile(asarPath, bundleName.replace(/^[\\/]/, "")).toString();
if (current.includes("__cut5")) {
  console.log(`CompHero ${version} is already modded.`);
  process.exit(0);
}
fs.mkdirSync(backup, { recursive: true });
fs.copyFileSync(asarPath, path.join(backup, "app.asar"));
fs.copyFileSync(exePath, path.join(backup, "CompHero.exe"));
console.log(`Backed up CompHero ${version} to ${backup}`);

// Extract, patch, repack.
const work = fs.mkdtempSync(path.join(os.tmpdir(), "comphero-mod-"));
const appDir = path.join(work, "app");
asar.extractAll(asarPath, appDir);
execFileSync(process.execPath, [path.join(here, "patch-bundle.js"), path.join(appDir, bundleName)], { stdio: "inherit" });
const newAsar = path.join(work, "app.asar");
await asar.createPackage(appDir, newAsar);

// Point the exe's embedded integrity hash at the new asar header.
const { headerString } = asar.getRawHeader(newAsar);
const hash = crypto.createHash("sha256").update(headerString).digest("hex");
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);
const entry = res.entries.find(e => e.type === "INTEGRITY" && e.id === "ELECTRONASAR");
if (!entry) throw new Error("INTEGRITY resource not found in CompHero.exe");
entry.bin = Buffer.from(JSON.stringify([{ file: "resources\\app.asar", alg: "SHA256", value: hash }]));
res.outputResource(exe);
const newExe = Buffer.from(exe.generate());

fs.copyFileSync(newAsar, asarPath);
fs.writeFileSync(exePath, newExe);
fs.rmSync(work, { recursive: true, force: true });
console.log(`Modded CompHero ${version}. New asar hash ${hash.slice(0, 12)}...`);
