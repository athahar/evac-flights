# Evac Flight Alert (Node.js v0)

This project validates the core criteria before heavier infrastructure:

1. Find bookable flights out of selected origin airports.
2. Keep only itineraries that end outside the Middle East.
3. Reject itineraries with Middle East transit stops.
4. Send an alert email only when valid offers exist.
5. Persist run state (`last_run_at`) and dedup to avoid spam.

## Why this phase first

This is the minimum proof that signal quality is real. It avoids spending time on Supabase, dashboards, and dispatcher UI before confirming that scanned offers produce useful and timely alerts.

## Phase plan

- Phase 0 (this repo now): Node server + Duffel scan + route filtering + Resend + SQLite state.
- Phase 1: Expand destination and carrier coverage, tighten filtering and ranking.
- Phase 2: Reliability (scheduler hardening, retries, observability, ops alerts).
- Phase 3: Booking action page + human dispatcher queue + payment readiness flow.
- Phase 4: Partial automation (API-first booking, browser fallback only where needed).

## Tech

- Node.js + Express
- Duffel API (offers)
- Resend API (email)
- SQLite (`better-sqlite3`) for run log + dedup (`data/output/state.db`)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

Set at minimum:
- `DUFFEL_TOKEN`
- `FR24_INPUT_FILE`
- `ORIGIN_AIRPORTS` (currently use `DXB`)

Optional but recommended for stability:
- `DUFFEL_RATE_LIMIT_PER_MINUTE=50`
- `DUFFEL_RATE_WINDOW_MS=60000`

Optional live FR24 API source:
- `FR24_API_ENABLED=true`
- `FR24_API_KEY=...` (aliases supported: `FLIGHT_RADAR_API_KEY`, `FLIGHTRADAR24_API_KEY`)
- `FR24_API_URL_TEMPLATE=...` (optional if default template mode is enabled)
- `FR24_API_USE_DEFAULT_TEMPLATE=true` (uses FR24 v1 `flight-summary/light` outbound day window)
- `FR24_API_AUTH_HEADER=Authorization`
- `FR24_API_AUTH_PREFIX=Bearer`
- `FR24_API_ACCEPT_VERSION=v1`
- `FR24_API_RESPONSE_PATH=data` (JSON path to flight array)
- `FR24_API_MAX_ATTEMPTS=3` (retry attempts per request)
- `FR24_API_BACKOFF_MS=1200` (base backoff between retries)
- `FR24_API_RATE_LIMIT_PER_MINUTE=10` (request pacing, keep below plan limit)
- `FR24_API_INTER_REQUEST_DELAY_MS=0` (extra delay between sequential requests)
- `FR24_API_MIN_STATUS_COVERAGE=0.8`
- `FR24_API_MIN_FLIGHT_COVERAGE=0.7`
- `FR24_API_MIN_DESTINATION_COVERAGE=0.95`
- `FR24_API_MIN_DEPARTURE_COVERAGE=0.95`
- `FR24_API_FALLBACK_TO_FILE=true` (recommended)

3. Start server:

```bash
npm start
```

Default port is `3210`.
Open: `http://localhost:3210`

## Dashboard UX (new)

The web UI is now the default app view and has:
- `Last Live Scan` tab: last completed run with timestamp and sorted results.
- `Live Scan Details` tab: live in-progress data stream + next-run countdown.
- 30-minute scheduler by default (`DASHBOARD_INTERVAL_MINUTES=30`).

Each row shows:
- date
- departure time
- airline
- flight number
- from/to
- tickets available (yes/no/checking)
- price
- airline website link (only where explicit mapping exists)

### Admin controls feature flag

The top-right controls are hidden for normal users:
- `Run Now`
- `Resume/Pause Scheduler`
- `Clear Runs`

To show them, open the dashboard with:

```text
?ff=addadxb
```

Example:

```text
http://localhost:3210/?ff=addadxb
```

## Data folders

- `data/input/`
  - FR24 source file (default: `fr24-march-05`)
  - airline website mapping file (default: `airline-websites.json`)
- `data/output/`
  - dashboard/scan SQLite DB (`state.db`)
  - generated availability TSV outputs

## Endpoints

- `GET /health`
- `GET /api/dashboard/state`
- `GET /api/dashboard/events` (SSE live stream)
- `POST /api/dashboard/run-now`
- `POST /api/dashboard/scheduler/start`
- `POST /api/dashboard/scheduler/stop`
- `POST /api/dashboard/clear-runs`
- `GET /api/public-config`
- `POST /scan`
- `GET /runs?limit=20`
- `GET /seen?limit=50`
- `POST /scheduler/start`
- `POST /scheduler/stop`

### Trigger a manual scan

```bash
curl -sS -X POST http://localhost:3210/scan \
  -H 'Content-Type: application/json' \
  -d '{"departureDate":"2026-03-06","maxConnections":1}'
```

### Start dashboard scheduler

```bash
curl -sS -X POST http://localhost:3210/api/dashboard/scheduler/start
```

Scheduler auto-start is disabled on server launch (manual mode).

## PostHog analytics

Set in `.env`:
- `POSTHOG_KEY` (required to enable tracking)
- `POSTHOG_HOST` (optional, defaults to `https://us.i.posthog.com`)

When enabled, the frontend tracks:
- page visit (`page_view`)
- tab clicks (`tab_clicked`) for:
  - `Last Live Scan`
  - `Live Scan Details`
- website open clicks (`open_link_clicked`)

## Simple listing first (no email, no SQLite)

If you only want to list matching flights first, use:

```bash
npm run list:flights -- \
  --origins DXB \
  --dates 2026-03-05,2026-03-06,2026-03-07 \
  --maxConnections 1 \
  --concurrency 4
```

This script:
- scans Duffel offers
- applies the same Middle East destination/transit filter
- prints matching flights to console
- does not send emails
- does not use SQLite state

## Rate limiting

The Duffel client includes process-level request throttling. By default it caps at `50` requests per `60s` window, plus retry/backoff on `429`.
You can override with env vars or (for availability checks) `--rpm`.

## Config files

- `config/blocked_middle_east.json` - blocked countries + airports
- `config/destinations.txt` - candidate destination airport codes

## FR24 -> Duffel scripts

Build filtered FR24 files:

```bash
npm run filter:fr24:no-me
npm run filter:fr24:priority
```

Check Duffel availability from filtered files:

```bash
npm run check:duffel:all -- --date 2026-03-05 --origin DXB --rpm 50 --delayMs 1500
npm run check:duffel:priority -- --date 2026-03-05 --origin DXB --rpm 50 --delayMs 1500
```

## Notes

- Duffel does not support a single "origin to anywhere" query. This service scans origin x destination pairs.
- Expand destinations gradually to manage API cost and latency.
- First origin airport is allowed to be in blocked region by design; only destination/transits are blocked.
## FR24 source selection

Dashboard scans now support two FR24 sources:

- File mode (default): parses `FR24_INPUT_FILE`
- API mode: set `FR24_API_ENABLED=true` and provide `FR24_API_KEY` (URL template optional with default-template mode)

The URL template is expanded per origin/date:
- `{AIRPORT}` -> origin IATA (e.g. `DXB`)
- `{DATE}` -> local date ISO (e.g. `2026-03-05`)

Default FR24 v1 template (when `FR24_API_USE_DEFAULT_TEMPLATE=true` and `FR24_API_URL_TEMPLATE` is empty):
- `https://fr24api.flightradar24.com/api/flight-summary/light?airports={AIRPORT}&type=outbound&flight_datetime_from={DATE}T00:00:00&flight_datetime_to={DATE}T23:59:59`

If `FR24_API_FALLBACK_TO_FILE=true`, API errors or empty API results automatically fall back to file input.

Hardening included:
- retries/backoff on FR24 API calls (including `429` and `5xx`)
- per-minute request limiter for FR24 requests
- post-normalization coverage validation to catch schema drift
- source telemetry logs (`source=api|file`, rows, retries, failures)

Rate budget guidance:
- keep `FR24_API_RATE_LIMIT_PER_MINUTE` at or below your plan cap
- tune retries with: `rateLimitPerMinute >= maxAttempts x endpointCallsPerRun`
