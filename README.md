# Folio

A local-first, Quiver-compatible notebook for Mac, iPhone, iPad, and the web.

**Try it:** https://folio-notes-james.jajamjamjamijamiejamie.chatgpt.site

No account, subscription, or API key is needed to try the public app. New visitors get their own local library, not access to anyone else's notes. Sync is opt-in.

## Get started

1. Open Folio and edit the welcome note or create a new notebook.
2. In Finder, **copy** your Quiver `.qvlibrary` or `.qvnotebook` package. Right-click the copy → **Compress**.
3. In Folio, choose **Import library** and select the ZIP. Read the import report. Your source files are never written to.
4. Check representative rich-text, code, math, and attachment-heavy notes before migrating fully.
5. Choose **Sync → Create a synced library**. Save the pairing key in a password manager.
6. On your other device, open Folio → Sync → paste that key → **Connect & merge libraries**.
7. Use **Export → Full Folio backup** regularly. Backups are plaintext files; store them privately.

### Install without an Apple developer account

- **iPhone/iPad:** open the public URL in Safari → Share → Add to Home Screen.
- **Mac:** Safari → File → Add to Dock; or use Chrome's Install app menu.
- Visit once online to cache the web app. Offline edits stay in IndexedDB. Reopen online and sync to transfer them.
- Browser, installed PWA, and native shell may have separate storage. Pair each installation separately.

### Native Apple apps

`native/Folio.xcodeproj` contains **FolioMac** and **FolioIOS**, using a shared SwiftUI/WebKit shell with persistent storage, file import, download/save dialogs, and external link handling. They load the published application. They are not fully native text editors and do not use CloudKit.

```sh
open native/Folio.xcodeproj
# Select FolioMac or FolioIOS, choose a signing team if deploying to a device, then Run.
```

Build locally without distribution signing:

```sh
xcodebuild -project native/Folio.xcodeproj -scheme FolioMac \
  -configuration Release -derivedDataPath build/mac CODE_SIGNING_ALLOWED=NO build
xcodebuild -project native/Folio.xcodeproj -scheme FolioIOS \
  -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/ios CODE_SIGNING_ALLOWED=NO build
```

The Mac release is an **Apple Silicon, ad-hoc-signed developer build**, not notarized. macOS may require Privacy & Security → Open Anyway. For a signed production iPhone build, choose your own signing team and unique bundle ID in Xcode. No TestFlight/App Store distribution or paid Apple membership was enabled. For reliable offline startup, use the installed web app; native WebKit offline caching is not guaranteed.

## What works

- Notebooks; search across titles, tags and cell contents; note creation, editing, move, soft delete, restore.
- Markdown preview, code highlighting, math rendering, HTML source editing with sanitized preview.
- Mixed Quiver cell types, note metadata, tags, timestamps, unknown cell fields and attachments retained through import/export.
- Local autosave, installable/offline web app, complete JSON backups and Quiver ZIP exports.
- AES-GCM encrypted cross-device synchronization with optimistic concurrency and deterministic conflict copies.
- Local import is atomic: parse failures reject the entire import before library mutation.

## First-release limits

- **100 MB** uncompressed import limit, **10 MB** per added attachment, **20 MB** encrypted whole-library sync limit. Base64 and revision history count toward sync size. Large libraries still work locally within browser storage limits, but are not performance-tested at scale.
- The entire encrypted library is transferred during each sync. Foreground auto-sync runs every 30 seconds and on window focus/online events; this is not real-time collaboration or background sync.
- Rich text is edited as HTML source; there is no WYSIWYG toolbar. Diagram cells are preserved/editable as source, not rendered diagrams.
- Notebook hierarchy metadata is retained for Quiver export; navigation is flat. No notebook rename/delete UI yet.
- Unknown Quiver files outside note resources and metadata/content are not imported. Original libraries remain the migration backup.
- Quiver note links work within the app where matching IDs exist. External images are blocked in previews for privacy; attached images render locally.
- The pairing key is stored on your device. Clearing app/browser data deletes the local notes and key. Anyone with the key can read/write that library. No recovery, sharing permissions, key rotation, or cloud-delete UI exists yet.
- No iCloud/CloudKit integration, notarization, App Store release, or physical-device verification. Automated checks use synthetic libraries, not your actual Quiver library.

## Development

Requires Node.js 22+ and npm. Xcode is only needed for native targets.

```sh
npm ci
npm run build
npm run preview        # http://localhost:8787; local R2 storage, no cloud account required
npm test              # importer, merge, encryption, API validation
npx playwright install chromium
npm run test:e2e       # browser flows; see PLAYWRIGHT_CHROME_PATH below
```

Use `npm run dev` in another terminal for Vite hot reload; the local Worker at port 8787 handles `/api`. Rebuild before `npm run preview` when testing the production bundle.

Set `PLAYWRIGHT_CHROME_PATH` to a Chrome executable if desired. Otherwise Playwright's downloaded Chromium is used. Set `FOLIO_URL` to run browser tests against a deployed instance. Tests create their own synthetic encrypted libraries and never use real notes.

## Architecture and privacy

React/Vite frontend; IndexedDB local storage; a Cloudflare Worker and R2 encrypted snapshots. See [architecture](docs/architecture.md) and [deployment](docs/deployment.md).

The browser generates a cryptographically random 256-bit pairing key. Domain-separated SHA-256 derivations produce the AES-256-GCM encryption key and a separate bearer credential. Only ciphertext, a random IV, and the bearer credential reach the server. The server hashes the bearer credential for the storage path. Titles, note text, tags, attachments and notebook names are inside the encrypted payload. The hosting provider can observe IP addresses, request timing, and encrypted library sizes. There is no analytics SDK.

This is a new, unaudited application. The host serves its JavaScript, so a compromised host could change code and access keys during use. It is not a zero-trust or formally audited security product.

## License

MIT. Folio is independent of Quiver and its original developer. Dependency licenses remain with their authors.
