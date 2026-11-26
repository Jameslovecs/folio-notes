# Architecture

## Model

Libraries contain notebook and note records with stable IDs. Each mutation creates a random revision ID and retains causal ancestor IDs. A note contains ordered Quiver cells, base64 resources, raw metadata/content for unknown field preservation, tags, and timestamps. Deletions are tombstones so an older device does not resurrect a note.

Merge selects a causal descendant when possible. Concurrent heads are sorted by revision ID to choose a deterministic primary; the other becomes a deterministic conflict copy. Merge is designed to be repeatable and not silently discard concurrent note content. It does not merge text within a note. Cell deletion requires confirmation; revision IDs are ancestry markers, not a full historical content store.

## Sync protocol

`GET /api/vault` and `PUT /api/vault` require a high-entropy bearer credential derived from the pairing key. No public list endpoint exists. A GET returns ciphertext and an ETag, or 404 for a fresh vault. The client decrypts and merges with local state, then encrypts using a fresh 96-bit IV. PUT requires `If-Match` (existing snapshot) or `If-None-Match: *` (creation). R2 conditional writes are atomic; HTTP 412 makes the client fetch/merge/retry up to four times.

Edits made while a sync is in flight are merged back into its result before saving locally. Conflict copies stay visible and can be manually reconciled, then moved to Trash. Background synchronization is deliberately not claimed: browsers suspend closed apps.

The 20 MB cap bounds whole-library transfer and server buffering; import is limited to 100 MB expanded data and 20,000 entries. This prototype is not an unlimited attachment repository. Free-tier capacity and provider availability are not an uptime guarantee. A public abuse-hardening phase (rate limits/quotas and lifecycle management) is needed before large-scale use.

## Rendering

Markdown and imported HTML pass through DOMPurify before DOM insertion. Code is highlighted locally. KaTeX renders with trust disabled. Third-party images are not fetched. Content Security Policy restricts scripts/network to the app origin. Internal Quiver note links are handled by the app; attached resources remain local in the library.

## Native wrapper

SwiftUI hosts a WKWebView with a persistent website data store. The app origin is app-bound. External HTTP(S)/mailto links open outside the shell. File inputs use native pickers; WKDownload exposes Save (Mac) or Share (iOS). The web app is the canonical editor. Native offline startup and physical iOS device behavior remain unverified; use the PWA for verified offline editing.
