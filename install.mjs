// Applies the "Cut last 5s" mod to the installed CompHero (Windows or macOS).
// Usage: node install.mjs            (apply)
//        node install.mjs --restore  (put the original files back)
// Re-run after CompHero auto-updates, since an update replaces the files.
import * as asar from "@electron/asar";
import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backup = path.join(here, "backup");
const isMac = process.platform === "darwin";

// ---- where CompHero lives, and how to tell if it's running ----
let asarPath, extraFile, macApp;
if (isMac) {
  macApp = ["/Applications/CompHero.app", path.join(os.homedir(), "Applications", "CompHero.app")]
    .find(p => fs.existsSync(p));
  if (!macApp) {
    console.error("CompHero.app not found in /Applications or ~/Applications.");
    process.exit(1);
  }
  asarPath = path.join(macApp, "Contents", "Resources", "app.asar");
  extraFile = path.join(macApp, "Contents", "Info.plist");      // holds the asar integrity hash
} else if (process.platform === "win32") {
  const install = path.join(process.env.LOCALAPPDATA, "Programs", "CompHero");
  asarPath = path.join(install, "resources", "app.asar");
  extraFile = path.join(install, "CompHero.exe");               // holds the asar integrity hash
} else {
  console.error("Only Windows and macOS are supported.");
  process.exit(1);
}

function isRunning() {
  if (isMac) {
    try { execFileSync("pgrep", ["-x", "CompHero"]); return true; } catch { return false; }
  }
  return execFileSync("tasklist", ["/FI", "IMAGENAME eq CompHero.exe"]).toString().includes("CompHero.exe");
}
if (isRunning()) {
  console.error("Close CompHero first.");
  process.exit(1);
}

// macOS refuses to launch an app whose signature no longer matches, so re-sign it ad hoc.
function resignMac() {
  try { execFileSync("xattr", ["-dr", "com.apple.quarantine", macApp]); } catch {}
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", macApp], { stdio: "inherit" });
}

const backupAsar = path.join(backup, "app.asar");
const backupExtra = path.join(backup, path.basename(extraFile));

if (process.argv.includes("--restore")) {
  fs.copyFileSync(backupAsar, asarPath);
  fs.copyFileSync(backupExtra, extraFile);
  if (isMac) resignMac();
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
fs.copyFileSync(asarPath, backupAsar);
fs.copyFileSync(extraFile, backupExtra);
console.log(`Backed up CompHero ${version} to ${backup}`);

// Extract, patch, repack.
const work = fs.mkdtempSync(path.join(os.tmpdir(), "comphero-mod-"));
const appDir = path.join(work, "app");
asar.extractAll(asarPath, appDir);
execFileSync(process.execPath, [path.join(here, "patch-bundle.js"), path.join(appDir, bundleName)], { stdio: "inherit" });
const newAsar = path.join(work, "app.asar");
await asar.createPackage(appDir, newAsar);

// Point Electron's embedded integrity hash at the new asar header.
const { headerString } = asar.getRawHeader(newAsar);
const hash = crypto.createHash("sha256").update(headerString).digest("hex");

if (isMac) {
  fs.copyFileSync(newAsar, asarPath);
  // Info.plist: ElectronAsarIntegrity > Resources/app.asar > hash
  const buddy = "/usr/libexec/PlistBuddy";
  let hasKey = true;
  try { execFileSync(buddy, ["-c", "Print :ElectronAsarIntegrity", extraFile], { stdio: "ignore" }); } catch { hasKey = false; }
  if (hasKey) execFileSync(buddy, ["-c", `Set :ElectronAsarIntegrity:Resources/app.asar:hash ${hash}`, extraFile]);
  resignMac();
} else {
  const ResEdit = await import("resedit");
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(extraFile), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const entry = res.entries.find(e => e.type === "INTEGRITY" && e.id === "ELECTRONASAR");
  if (!entry) throw new Error("INTEGRITY resource not found in CompHero.exe");
  entry.bin = Buffer.from(JSON.stringify([{ file: "resources\\app.asar", alg: "SHA256", value: hash }]));
  res.outputResource(exe);
  const newExe = Buffer.from(exe.generate());
  fs.copyFileSync(newAsar, asarPath);
  fs.writeFileSync(extraFile, newExe);
}

fs.rmSync(work, { recursive: true, force: true });
console.log(`Modded CompHero ${version}. New asar hash ${hash.slice(0, 12)}...`);
