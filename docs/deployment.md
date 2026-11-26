# Deployment and ownership

The public source repository is `Jameslovecs/folio-notes`. The deployed public Site is owned by the user's Sites account. No domain purchase, paid plan, payment method, subscription, or API billing was enabled.

## Current Sites deployment

`.openai/hosting.json` declares the Site ID and `BUCKET` R2 binding. `npm run build` compiles the frontend, creates a versioned offline service worker, and embeds static assets into a Worker ES module at `dist/server/index.js`. This portable artifact is published with the Sites source/version/deployment workflow. The source and artifact must refer to the same commit.

`GET /api/health` returns an availability check and whether storage is configured. It does not expose user data. The public site's audience is public; each note library is separately protected by its random pairing credential and client encryption.

## Self-hosting

You can host the Worker/R2 app in your own Cloudflare account. This is optional; **check current provider pricing and limits before provisioning resources or enabling billing**. The local development command uses emulated storage and does not provision paid resources.

1. Clone the repo and `npm ci`.
2. Configure a bucket you own under `r2_buckets` in `wrangler.jsonc`.
3. Run `npm run build`.
4. Use your provider's normal authenticated deployment flow.
5. If changing the public origin, update `native/FolioApp.swift` and `WKAppBoundDomains` in the Info.plist/generator before rebuilding native targets.

For another Sites deployment, register a new Site and replace its ID rather than publishing to the original owner's ID.

## Apple distribution

Use Xcode's signing settings for your own team. Signing identities/profiles stay in your local keychain/Xcode setup and must never be committed. An App Store/TestFlight release and notarized Mac release need the appropriate Apple account and distribution review. Those were not purchased or configured in this release.

## Secrets and backups

No application secrets or actual Quiver libraries belong in Git. Pairing keys are generated on user devices, never bundled. `.gitignore` excludes native outputs, local Worker data, ZIPs, Quiver packages, and environment files. Full JSON/Quiver exports are intentionally plaintext for portability. Keep backups separate from the deployed server.
