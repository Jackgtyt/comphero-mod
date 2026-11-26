# comphero-mod

Adds a **"Cut last 5s"** button to CompHero's Trim view header (left of Export). It cuts the last 5 seconds off every clip except the last one. It goes through CompHero's undo history, so Ctrl+Z / Cmd+Z reverts it.

Works on **Windows** and **macOS**. Needs [Node.js](https://nodejs.org) 18 or newer.

## Use
Close CompHero first, then:
```
git clone https://github.com/Jackgtyt/comphero-mod.git
cd comphero-mod
npm install
node install.mjs            # apply the mod
node install.mjs --restore  # put the original files back
```
Re-run `node install.mjs` after CompHero auto-updates, since an update replaces the files.

### macOS notes
- CompHero.app must be in `/Applications` or `~/Applications`.
- The installer re-signs the app ad hoc, because macOS won't launch it otherwise once its files change. If macOS still blocks it on first launch, right-click CompHero.app > **Open**, or allow it in System Settings > Privacy & Security.
- If you get a permission error, run `sudo node install.mjs`.
