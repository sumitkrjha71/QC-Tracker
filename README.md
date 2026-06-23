# QC Time Tracker

A Spyne quality-control turnaround dashboard. Three product tabs — **Image · 360 Spin ·
Video** — each showing daily QC time (median/avg), a `<6h / 6–12h / >12h` resolution
breakdown, throughput, and day-over-day improvement. Dark/light theme and an
**Enterprise / SMB / Embed** segment master-filter.

Data is read **live at request time** from Metabase public questions (one per product),
so the dashboard reflects query changes without a redeploy.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the Metabase question UUIDs
npm run dev                  # http://localhost:3000
```

## Environment variables

| Var | Purpose |
|-----|---------|
| `METABASE_URL` | Metabase base URL, e.g. `https://metabase.spyne.ai` |
| `METABASE_QC_IMAGE_UUID` | public UUID of the **Image** daily QC question |
| `METABASE_QC_360_UUID` | public UUID of the **360** daily QC question |
| `METABASE_QC_VIDEO_UUID` | public UUID of the **Video** daily QC question (optional) |

Each daily question returns: `day, segment, throughput, median_qc_hrs, avg_qc_hrs,
under_6h, h6_12, over_12h`. The source SQL lives in [`metabase/`](metabase/).

## Deploy (Vercel)

1. Push this repo to GitHub.
2. Import it at [vercel.com](https://vercel.com) → **New Project** (Next.js auto-detected).
3. Add the environment variables above.
4. Deploy. Every subsequent `git push` auto-redeploys.

> The app fetches Metabase server-side, so the Metabase instance must be reachable from
> the public internet for the cloud deployment to load data.

## Architecture

```
src/
  lib/qc.ts                 fetch per-product daily CSVs -> tracker payload (+ segment filter)
  app/api/qc/route.ts       GET /api/qc?segment=...
  components/QcTracker.tsx   tabs + theme toggle + segment filter + charts (line / buckets / throughput)
metabase/                   the source SQL for each daily question
```
