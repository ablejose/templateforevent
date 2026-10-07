# Bulk sites from the business sheet

One command turns every row of the business sheet into its own live website.
Everything lives in **`scripts/sitegen.mjs`** (no extra packages).

```bash
npm run sitegen -- --sheet "https://docs.google.com/spreadsheets/d/<id>/edit"
```

## What changes per business

| From the sheet | From Google Places (by the row's maps `cid`) | Template (same on every site) |
| --- | --- | --- |
| Name, address, area, city | Map pin, district, postcode | Hero slides, About photos |
| Phone (→ call + WhatsApp) | Opening hours | Services, How we work, Menu |
| Email, Instagram, Facebook | Rating, review count, up to 5 real reviews | Loader, colours, copy |
| Google Maps link | **Their photos → gallery section only** | |

If a sheet phone cell is empty or `#ERROR!`, the phone comes from Google. Rows
with no phone anywhere are skipped and listed in the results file.

## Setup (once)

1. Use **64-bit Node 18+** (`node -p process.arch` → `x64`).
2. `npm install`
3. Copy `.env.sitegen.example` → `.env.sitegen.local` and fill in:
   - `GOOGLE_MAPS_API_KEY`: Places API (New) enabled. Without it, sites still
     build, just with no gallery, map pin or reviews.
   - `VERCEL_TOKEN` and optionally `VERCEL_TEAM` (team slug, e.g. `able8`).

## Running

```bash
# see what would be generated (names, slugs, phones) — no API calls
npm run sitegen -- --sheet "<sheet url>" --list

# try one city first, build only (sites land in .sitegen/sites/<slug>)
npm run sitegen -- --sheet "<sheet url>" --city changanassery --no-deploy

# everything, 3 builds at a time, deployed
npm run sitegen -- --sheet "<sheet url>" --workers 3
```

| Option | |
| --- | --- |
| `--city a,b` / `--only slug,slug` / `--limit n` | pick rows |
| `--workers n` | parallel builds (default 2; ~1.5 GB RAM each) |
| `--photos n` | gallery photos per site (default 8) |
| `--prefix p` | Vercel project names become `p-<slug>` |
| `--no-deploy` | build only |
| `--force` | rebuild + redeploy even if nothing changed |

## Re-running is safe

Everything is cached in `.sitegen/` (git-ignored):

- `cache/places`, `cache/photos`: Places lookups and photos are fetched once.
- `results.json` / **`results.csv`**: per business it records status
  (`live` / `built` / `failed` / `skipped`), URL and notes. Paste the CSV back into the sheet.
- `logs/<slug>.log`: full build log for any failure.

Running the same command again skips sites that are live and unchanged,
retries failed ones, and deploys built-but-not-deployed ones without
rebuilding. If Vercel's daily deployment quota is hit, the run keeps building
and the next run deploys the rest. Ctrl+C stops cleanly after the sites in progress.

## How it works

1. Reads every tab of the sheet that has `Business Name`, `Full Address` and
   `Google Maps Link` columns. Run logs and "removed" tabs are ignored. The
   same business on two tabs (same `cid`) is merged.
2. Places API (New) text search, matched exactly on the row's `cid`, then up
   to N photos downloaded.
3. Each worker is a light copy of this repo in `.sitegen/workers/wN` (shared
   `node_modules`, own build cache). The script writes the business into
   `events/active.json` there and runs `next build` with lint and type-check
   off (the template is checked once, in this repo).
   `events/from-business.ts` maps that JSON onto the full site config.
4. The static `out/` is deployed to its own Vercel project via the REST API.
   Only files Vercel doesn't already have are uploaded, so template images
   and fonts upload once for all sites.

Timing on this machine: about 50 s for the first build per worker, about 22 s
after that, plus deploy time.

## Before running at scale

- **Vercel Hobby limits** apply: around 100 deployments/day and a project cap,
  so ~1,000 sites need several days or a Pro team. The script pauses deploys
  when the quota is hit and resumes on the next run.
- **Places API cost**: one Text Search (Enterprise + Atmosphere fields) plus
  N photo requests per business. Check current pricing and your free usage.
- **Google's Maps Platform terms** limit storing Places content (photos,
  reviews) long term. Review them for your use.
- In this repo, `events/active.json` must stay `null`. It is only filled inside
  the worker copies.
