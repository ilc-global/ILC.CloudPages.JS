# CDN Publishing & Management

The CloudPages CDN lives on the Azure storage account **ilcreportscdn**
(`ILC.FishbowlReports` RG, static website / `$web`), fronted by
**cdn.ilcreports.com** (Cloudflare). This repo is the single source of truth:
**nothing is ever hand-uploaded** — the two scripts below are the only write
path, and this repo's git history is the CDN's audit log.

## Layout

```
/cloudpages/vX.Y.Z/   cloudpages.js, fb.js, cloudpages.css   immutable, 1y cache
/cloudpages/latest/   same trio — moves on EVERY publish      5-min cache
/cloudpages/stable/   same trio — moves only on promote       10-min cache
/cloudpages/versions.json        {latest, stable, versions[]}
/vendor/<lib>/<version>/<file>   third-party pins             immutable, 1y cache
/vendor/manifest.json            hosted libs + sha384 SRI hashes
```

## Workflows

### 1. Release the library
```
# bump @version in js/cloudpages.js, commit, then:
./scripts/publish-cdn.sh 2.2.1
```
Publishes the immutable `v2.2.1` pin and moves `latest`. Refuses to run if
`js/cloudpages.js` doesn't declare `@version 2.2.1`. `stable` is untouched.

### 2. Promote to stable (after soaking on latest)
```
./scripts/publish-cdn.sh --promote-stable 2.2.1
```
Copies the immutable pin **from the CDN itself** (never the working tree) so
stable receives byte-identical soaked code. **Rollback = re-promote the
previous version** — effective within the 10-minute cache TTL.

### 3. Add / upgrade a vendor library
Edit `scripts/vendor-manifest.json`: ADD a new `{lib, version, files[]}` entry
(existing entries stay — old paths must keep serving forever). Commit, then:
```
./scripts/publish-vendor.sh
```
Downloads from the declared upstream URLs, uploads immutably, **refuses to
overwrite** any existing version path, and regenerates `/vendor/manifest.json`
with sha384 SRI hashes. Moving a page to the new version is a deliberate
per-page edit — the CDN never upgrades a page implicitly.

### 4. What pages reference (policy)
| Page kind | cloudpages.js | vendor libs |
|---|---|---|
| Customer-shipped / regulated | `/cloudpages/vX.Y.Z/` (pin) | exact `/vendor/<lib>/<ver>/` + `integrity=` |
| Catalog default | `/cloudpages/stable/` | exact versions + `integrity=` |
| Our dev/test pages | `/cloudpages/latest/` | exact versions |

Vendor references are ALWAYS exact versions — no channels exist for
third-party code, by design. Take `integrity` hashes from
`/vendor/manifest.json`; keep a page's local `vendor/` folder as the
documented offline fallback for egress-restricted customer sites.

## Invariants (enforced by the scripts, not convention)
- Versioned paths (`/cloudpages/vX.Y.Z/`, `/vendor/<lib>/<ver>/`) are write-once.
- `stable` moves only via an explicit `--promote-stable`.
- Manifests are rebuilt from the actual blobs on every publish — no drift.
- Vendor bytes come from upstream at publish time, hashes recorded (SRI).

## Access
Publishing needs Azure CLI auth on the **Y-ILC_Internal** subscription with
rights to `ilcreportscdn` (scripts use `--auth-mode key`). Cloudflare fronts
the domain; DNS/Worker changes go through the ilcreports.com zone.
