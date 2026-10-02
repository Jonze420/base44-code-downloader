# Base44 Code Downloader — Chrome Extension

## What this is

A **Manifest V3 Chrome extension** that downloads Base44 project source code as a ZIP from the active `app.base44.com` editor tab. It is NOT a web application — it relies on `chrome.tabs`, `chrome.scripting`, `chrome.downloads`, and `chrome.storage` APIs that only exist inside a loaded Chrome extension.

## Running in the Base44 preview

The preview serves the extension's popup UI as a static page via `docker-compose.base44.yml` (Python `http.server` on port 3000). `index.html` embeds `popup.html` in an iframe with a note explaining it's a Chrome extension. `popup.js` has a guard (`typeof chrome === "undefined"`) so it shows a preview message instead of crashing outside extension context.

## Real usage

Load as an unpacked extension: `chrome://extensions` → Developer mode → Load unpacked → select this folder. Then open a project in `app.base44.com`, click the extension icon, and use Detect / Download ZIP.

## Files

- `manifest.json` — MV3 manifest (permissions: activeTab, downloads, scripting, storage)
- `popup.html` / `popup.css` / `popup.js` — extension popup UI and logic
- `index.html` — preview-only landing page (not part of the extension)
