# VIN Delivery Tracker

A delivery-time tracking framework that measures how long each **deliverable**
spends at every stage of its processing journey, and renders a **stage-wise
progress bar + KPI dashboard** for bottlenecks, turnaround time (TAT), stage
aging, and end-to-end delivery performance — segmented by **Image / 360 / Video**.

```
[Received] ──tech──▶ [Tech done] ──ai──▶ [AI done] ──qc──▶ [QC done = Delivered]
     │                    │                  │                    │
DealerVinMapping     Ai_sku            cadence_queue          Ai_sku
.CreatedAt           ."Created On"     ."Process Finish Time" ."Qc Time"
(per DealerVinId)    (per sku_id)       (per sku_id)          (per sku_id)
```

| Stage | Duration |
|-------|----------|
| Tech Processing | `Created On` − `CreatedAt` |
| AI Processing   | `Process Finish Time` − `Created On` |
| Quality Control | `Qc Time` − `Process Finish Time` |
| **End-to-end TAT** | `Qc Time` − `CreatedAt` |

QC Time is the final delivery point (4 stages).

## Grain & join (validated against the real schema)

The unit of work is a **deliverable** = (DealerVin × media type). A received VIN
fans out to up to three media SKUs, and the `medias` table is the bridge:

```
DealerVinMapping ──DealerVinId──▶ medias ──┬─ Catalog ID      → sku (image)
  .CreatedAt = received                     ├─ Spin ID         → sku (360)
                                            └─ FeatureVideo ID → sku (video)
                                                    │  sku_id
                         ┌──────────────────────────┴───────────────┐
              Ai_sku."Sku ID"  (tech: Created On, qc: Qc Time)   cadence_queue."Sku ID"
                                                                  (ai: Process Finish Time)
```

Why the bridge: in the real data `Ai_sku.DealerVinId` / `MediaId` / `Vin` are
**empty**, so a VIN can only be linked to its SKUs through `medias`. That same
table also yields the Image/360/Video split (Catalog / Spin / FeatureVideo).

---

## Quick start (runs immediately on demo data)

```bash
npm install
npm run dev      # http://localhost:3000
```

Renders right away on **synthetic data** — no database needed.

## Point it at real Metabase data

1. **Create the combined question.** In Metabase, create a new **Native (SQL)**
   question and paste [`metabase/combined_query.sql`](metabase/combined_query.sql).
   The four card references are **pre-filled** (`{{#12382}}` DealerVinMapping,
   `{{#12385}}` medias, `{{#12383}}` Ai_sku, `{{#12384}}` cadence_queue). Then:
   - Add two **Date** parameters named `from` and `to`.
   - Use autocomplete to confirm the ~8 column names (see the CONFIRM checklist
     in the file — especially the nested `medias` ones). **Preview**, then Save.

2. **Wire env.** Copy `.env.example` → `.env.local`, set `DATA_SOURCE=metabase`,
   `METABASE_URL`, and **either**:
   - enable public sharing on the question and set `METABASE_PUBLIC_UUID` (no key), **or**
   - set `METABASE_CARD_ID` + `METABASE_API_KEY` (or username/password).

3. Restart `npm run dev`. The header badge flips from **demo data** to **metabase**.

The app calls that one card per request with the date window; **all filtering
happens in the warehouse** (we never pull raw tables — the full DealerVinMapping
export alone is ~213 MB). Stats are computed in TypeScript.

---

## Date window

Defaults to a **rolling last 30 days**, recomputed on every fetch — so each day
it automatically covers `today − 30 → today` with no manual setting. The combined
question self-defaults to the same 30 days (via `CURRENT_DATE`) when no params are
passed; the date pickers in the UI let you drill into any custom range.

## What's on the dashboard

- **KPI row** — deliverable + VIN counts, avg/median/P90 TAT, SLA compliance,
  aging count, and the current bottleneck stage.
- **Stage-wise progress bar** — average time per stage; bottleneck = widest.
- **Delivery TAT over time** — daily trend (downward slope = improvement).
- **Per-stage turnaround** — avg / P90 bars per stage.
- **Image · 360 · Video** — per-media comparison (from the `medias` split).
- **Aging / stuck** — in-progress deliverables past their stage threshold.
- **Recent deliveries** — per-deliverable stage breakdown with SLA flag.

## Configuration (env)

| Var | Meaning | Default |
|-----|---------|---------|
| `DATA_SOURCE` | `mock` or `metabase` | `mock` |
| `METABASE_CARD_ID` | id of the combined question | — |
| `METABASE_PARAM_FROM` / `_TO` | template-tag names in the question | `from` / `to` |
| `METABASE_DATE_PARAM_TYPE` | Metabase date param type | `date/single` |
| `TAT_TARGET_HOURS` | end-to-end SLA target | `24` |
| `STAGE_AGING_THRESHOLDS_HOURS` | `tech,ai,qc` aging cutoffs | `8,8,4` |

## Open validation items (confirm on first live run)

- **`FeatureVideo` sku ids** carry a `sku-` prefix; the SQL strips it to match
  `Sku ID`. Confirm video deliverables actually join.
- **Video tech/QC**: if video SKUs aren't in `Ai_sku`, their Tech/QC times will
  be null (AI-done still comes from `cadence_queue`). Surface as needed.

## Architecture

```
metabase/combined_query.sql   ⭐ the one SQL question to bind in Metabase
src/
  lib/
    schema-map.ts   logical model + RESULT_COLS contract + media canonicalizer
    metabase.ts     saved-card query path (api-key/session) + mock switch
    mock.ts         synthetic data generator (VIN -> media SKUs)
    stages.ts       stage defs + per-deliverable journey/aging/SLA
    kpi.ts          stats + KPI/trend/media aggregation
    format.ts       duration/percentile helpers
    types.ts        shared types
  app/
    api/metrics/route.ts   GET /api/metrics?from&to -> full payload
    page.tsx / layout.tsx / globals.css
  components/        dashboard UI (progress bar, charts, tables)
```
