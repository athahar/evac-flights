# FR24 API Migration Analysis

> Deep technical analysis for replacing manual FR24 file input with live FlightRadar24 API data.
> Date: 2026-03-05 | Status: Analysis complete, pending approval

---

## Critical Issues (ordered by severity)

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| 1 | **HIGH** | No retry/backoff on FR24 API calls — a single timeout kills the entire run | `lib/fr24.js:376-393` (`fetchJson`) |
| 2 | **HIGH** | Sequential airport×date fetching with no concurrency control or per-request rate limiting | `lib/fr24.js:403-420` (`fetchFr24ApiRows`) |
| 3 | **HIGH** | No request-level credit tracking — can silently exhaust FR24 monthly credit budget | `lib/fr24.js:395-423` |
| 4 | **MEDIUM** | `normalizeApiFlight` probes ~10 field paths speculatively — no schema validation or version pinning | `lib/fr24.js:279-368` |
| 5 | **MEDIUM** | Empty API response (0 flights) with `fr24ApiFallbackToFile=false` silently produces empty dashboard | `lib/fr24.js:432` |
| 6 | **MEDIUM** | URL template uses `{DATE}` but FR24 API v1 may not accept `YYYY-MM-DD` natively | `lib/fr24.js:370-374` |
| 7 | **LOW** | No observability — no metrics/events emitted for API source selection, fallback triggers, or latency | `lib/fr24.js:425-448` |
| 8 | **LOW** | `assertRequiredConfig` doesn't validate URL template format (missing `{AIRPORT}` placeholder) | `lib/config.js:104-107` |

---

## 1. Current State

### Data flow (file mode — current default)

```
┌──────────────────┐      ┌──────────────┐      ┌────────────────┐      ┌──────────┐
│ FR24 website     │─copy─▶│ data/input/  │─parse▶│ parseFr24File  │─filter▶│ dashboard│
│ departures board │ paste │ fr24-march-05│      │ lib/fr24.js:115│       │ runner   │
└──────────────────┘      └──────────────┘      └────────────────┘      └──────────┘
                                                         │
                                                  filterFr24Rows
                                                  lib/fr24.js:173
```

**File format**: Multi-line tab-separated text copied from the FR24 web departures board. Each flight spans 4 lines:
1. `HH:MM AM/PM\tFLIGHT_CODE` (time + flight number)
2. `City (IATA)` (destination)
3. `Airline\tAircraft` (operator + aircraft type)
4. Status text (`Scheduled`, `Estimated dep. HH:MM AM/PM`, `Canceled`, etc.)

Date headers like `Thursday, Mar 05` delimit sections. The parser (`parseFr24File`, `lib/fr24.js:115-171`) walks lines sequentially, tracking the current date section.

**Volume**: The current DXB file contains **~879 flight entries** across ~3,521 lines.

### Data flow (API mode — partially implemented)

```
┌────────────────┐      ┌──────────────────┐      ┌──────────────────┐      ┌──────────┐
│ FR24 API       │─HTTP─▶│ fetchFr24ApiRows │─norm─▶│ normalizeApiFlight│─filter▶│ dashboard│
│ fr24api.fr24.com│      │ lib/fr24.js:395  │      │ lib/fr24.js:279  │       │ runner   │
└────────────────┘      └──────────────────┘      └──────────────────┘      └──────────┘
```

**Entry point**: `loadFr24Rows()` (`lib/fr24.js:425-448`) checks `config.fr24ApiEnabled`:
- If `true`: calls `fetchFr24ApiRows()`, falls back to file on error/empty (if `fr24ApiFallbackToFile=true`)
- If `false` (default): reads file directly

**Normalization**: `normalizeApiFlight()` (`lib/fr24.js:279-368`) probes multiple candidate field paths for each datum (departure time, flight code, destination, airline, status). This is a defensive strategy for unknown/varying API shapes, but has no validation that the correct paths were hit.

### Key files and their roles

| File | Role | Key functions |
|------|------|---------------|
| `lib/fr24.js` | FR24 data ingestion (file + API) | `parseFr24File`, `loadFr24Rows`, `filterFr24Rows`, `fetchFr24ApiRows`, `normalizeApiFlight` |
| `lib/config.js` | Config loading + validation | `loadConfig`, `assertRequiredConfig` |
| `lib/dashboard-runner.js` | Run orchestration, Duffel calls, event emission | `createDashboardRunner`, `runNow` |
| `lib/duffel.js` | Duffel offer search with rate-limiting + retry | `searchOffers`, `duffelFetch` |
| `lib/filter.js` | Blocklist enforcement (airports + countries) | `isOfferAllowed` |
| `lib/airlineLinks.js` | Airline booking URL resolution + cargo detection | `resolveAirlineBooking`, `isCargoOperator` |
| `server.js` | Express server, SSE events, scheduler lifecycle | startup, route handlers |

### Scheduler behavior

- `dashboardIntervalMinutes=30` → runs at `:00` and `:30` Dubai time
- Aligned-slot computation in `computeNextAlignedRun()` (`lib/dashboard-runner.js:176-192`)
- Grace-window catch-up on startup (`isWithinAlignedSlotGrace`, 2-minute window)
- Single-flight guard (`runInFlight`) prevents concurrent runs

---

## 2. Gaps

### 2.1 FR24 API Integration Gaps

| Gap | Detail | Impact |
|-----|--------|--------|
| **No retry logic on FR24 fetch** | `fetchJson()` aborts on timeout or HTTP error — no retry, no exponential backoff. Compare with `duffelFetch()` which has 4-attempt retry with jitter. | A transient 503 or network blip fails the entire run (or falls back to stale file data) |
| **No per-request rate limiting** | FR24 API calls are fired sequentially in a tight loop (`for airport... for date...`). No sliding window, no delay between requests. | Risk of 429 responses at scale, especially multi-airport (DXB, AUH, SHJ × 2 days = 6 requests) |
| **No credit/usage tracking** | No counter for API calls made per run/day. No warning when approaching credit limits. | Can exhaust monthly FR24 credits without visibility |
| **No response validation** | `normalizeApiFlight()` probes paths optimistically. If the API changes its schema, rows silently come back with empty fields rather than erroring. | Ghost rows with missing destination/status pass through to dashboard |
| **No pagination support** | `extractFlightsArray()` reads a single response. FR24 API may paginate large airports (DXB has 800+ daily departures). | Truncated results for high-traffic airports |
| **URL template not validated** | `assertRequiredConfig` checks key+template exist but not that template contains `{AIRPORT}`. | Runtime URL construction silently produces wrong URLs |
| **No API version pinning** | No `Accept: application/vnd.fr24.v1+json` or version parameter. | Future API changes break silently |
| **Fallback is all-or-nothing** | If API returns *some* flights but fewer than expected (partial outage), there's no detection — it's treated as success. | Under-reporting during partial FR24 outages |

### 2.2 Operational Gaps

| Gap | Detail |
|-----|--------|
| **No source tagging** | Dashboard rows don't indicate whether they came from API or file. Can't diagnose data quality issues. |
| **No run-level FR24 metrics** | `run_started`/`run_completed` events don't include FR24 source type, row count, latency, or error details. |
| **No health check** | No endpoint to test FR24 API connectivity without a full run. |
| **No tests** | Zero test files exist in the project. No unit tests for `normalizeApiFlight`, `parseFr24File`, or `filterFr24Rows`. |

---

## 3. FR24 Field Mapping Table

Based on the official FR24 API v1 (from SDK analysis and `normalizeApiFlight` probe paths):

| Internal field | Type | FR24 API probe paths (in priority order) | File-mode source | Notes |
|---------------|------|------------------------------------------|-------------------|-------|
| `flightDate` | `YYYY-MM-DD` | Derived from departure timestamp via `buildLocalDateParts()` in target timezone | Parsed from section header `"Thursday, Mar 05"` → `parseDateHeader()` | |
| `departureLocalIso` | `YYYY-MM-DDTHH:mm:ss` | Derived: `coerceToDate()` → `buildLocalDateParts(date, timezone)` | Derived: `sectionDateIso + parseTime12()` | Timezone-aware conversion |
| `timeLocal` | `H:MM AM/PM` | Derived from departure timestamp | Parsed from first tab field | 12-hour format |
| `status` | `string` | `item.status.text` → `item.flight.status.text` → `item.status` → `item.state` | Line 4 of flight block | Normalized via `normalizeStatus()`: "Scheduled", "Estimated", "Canceled" |
| `destinationCity` | `string` | `item.destination.city` → `item.airport.destination.position.region.city` → `item.destination.name` → fallback to IATA | Parsed via `toCity()`: text before `(IATA)` | |
| `destinationIata` | `string` | `item.destination.iata` → `item.airport.destination.code.iata` → `item.route.destination` → `item.arrival.iata` | Parsed via `toIata()`: text inside parens | **Required** — null drops the row |
| `airline` | `string` | `item.airline.name` → `item.flight.airline.name` → `item.airline_name` → `item.operator.name` | First tab-split of airline/aircraft line | |
| `carrierCode` | `string` | Derived from flight code via `parseFlightCode()` | Same | 2-char IATA preferred, 3-char ICAO fallback |
| `flightNumber` | `string` | Derived from flight code via `parseFlightCode()` | Same | Numeric portion after carrier code |
| `flight` | `string` | `item.flight.number.iata` → `item.flight.identification.number.default` → `item.flight.iata` → `item.flight_number` → `item.number` | Raw `FLIGHT_CODE` column | Full code like `EK209` |
| `aircraft` | `string` | `item.aircraft.model.text` → `item.aircraft.model` → `item.aircraft` | Second tab-split of airline/aircraft line | Not used downstream but stored |

### Likely FR24 API v1 actual response structure

Based on the official JS SDK (`@flightradar24/fr24sdk`) and the probe paths in `normalizeApiFlight`:

```jsonc
// GET /api/live/flight-positions/full (filtered by bounds or airport)
// or GET /api/flight-summary/light?flight_datetime_from=...&flight_datetime_to=...
{
  "data": [
    {
      "flight": {
        "number": { "iata": "EK209" },
        "identification": { "number": { "default": "EK209" } },
        "status": { "text": "Scheduled" },
        "airline": { "name": "Emirates" }
      },
      "departure": {
        "scheduled": "2026-03-05T11:30:00+04:00",  // ISO 8601
        "estimated": null
      },
      "destination": {
        "iata": "ATH",
        "city": "Athens",
        "name": "Athens International Airport"
      },
      "airline": {
        "name": "Emirates"
      },
      "aircraft": {
        "model": { "text": "Boeing 777-300ER" }
      },
      "status": {
        "text": "Scheduled"
      }
    }
  ]
}
```

> **Caveat**: The exact response schema is behind FR24's login-walled API docs. The probe paths in `normalizeApiFlight` are a best-effort multi-schema adapter. The above is the *most likely* shape based on SDK patterns and probe priorities.

---

## 4. Rate / Credit Budget Table

### FR24 API subscription tiers (as of 2025/2026)

| Tier | Monthly credits | Price/mo | Rate limit |
|------|----------------|----------|------------|
| **Explorer** | 30,000 (60k with promo) | $9/mo | ~10 req/s (estimated) |
| **Essential** | 450,000 | $99/mo | Higher |
| **Advanced** | 4,050,000 | $900/mo | Highest |

> Credits-per-call vary by endpoint. Exact per-endpoint costs are behind FR24's portal. Assume **1 credit per flight-positions call** as a conservative baseline, with heavier endpoints (flight-summary/full) costing more.

### Request volume analysis

#### Scenario A: DXB-only, 2-day lookahead (current config)

| Metric | Value | Calculation |
|--------|-------|-------------|
| Airports | 1 (DXB) | `config.originAirports` |
| Dates per run | 2 | `config.dashboardLookaheadDays` |
| **API calls per run** | **2** | 1 airport × 2 dates |
| Runs per day | 48 | every 30 min × 24h |
| **API calls per day** | **96** | 2 × 48 |
| **API calls per month** | **~2,880** | 96 × 30 |
| Credit budget fit | Explorer tier | Well within 30k/mo |

#### Scenario B: Multi-airport (DXB, AUH, SHJ), 2-day lookahead

| Metric | Value | Calculation |
|--------|-------|-------------|
| Airports | 3 | `ORIGIN_AIRPORTS=DXB,AUH,SHJ` |
| Dates per run | 2 | |
| **API calls per run** | **6** | 3 × 2 |
| Runs per day | 48 | |
| **API calls per day** | **288** | 6 × 48 |
| **API calls per month** | **~8,640** | 288 × 30 |
| Credit budget fit | Explorer tier | Within 30k/mo |

#### Scenario C: Multi-airport, 3-day lookahead

| Metric | Value | Calculation |
|--------|-------|-------------|
| Airports | 3 | |
| Dates per run | 3 | |
| **API calls per run** | **9** | 3 × 3 |
| **API calls per day** | **432** | 9 × 48 |
| **API calls per month** | **~12,960** | |
| Credit budget fit | Explorer tier | Within 30k, but less margin |

### Concurrency and timing recommendations

| Setting | Recommended value | Rationale |
|---------|-------------------|-----------|
| Inter-request delay | 200–500ms | Avoid burst rate-limit. FR24 429 threshold is likely 5-10 req/s. |
| Max concurrent requests | 1 (sequential) | Simple, safe, matches current pattern. |
| Request timeout | 15s (current) | Reasonable for API calls. |
| Retry attempts | 3 | With exponential backoff: 1s, 2s, 4s + jitter. |
| Backoff base | 1000ms | Doubling on each retry. |
| 429 retry-after | Respect header | If present, wait that long; else use backoff. |
| Credit warning threshold | 80% of monthly budget | Log warning when 80% consumed. |

---

## 5. Failure Mode Analysis

### 5.1 API-level failures

| Failure mode | Current behavior | Recommended guard |
|-------------|-----------------|-------------------|
| **HTTP 429 (rate limited)** | Run fails or falls back to file | Retry with exponential backoff + `retry-after` header respect |
| **HTTP 5xx (server error)** | Run fails or falls back to file | Retry up to 3×, then fallback |
| **Timeout (>15s)** | `AbortController` aborts, run fails | Retry with increasing timeout (15s, 20s, 25s) |
| **Empty response (0 flights)** | Falls back to file if `fallbackToFile=true`; else empty dashboard | Add minimum-row sanity check: if <10 flights for DXB, treat as partial outage |
| **Partial response** | Silently accepted as full data | Compare flight count against historical baseline (DXB ≈ 400-900/day) |
| **Auth failure (401/403)** | Run fails | Fail fast, no retry, emit alert event |
| **Schema drift** | Rows produced with empty fields (normalizeApiFlight returns null for missing required fields, silently drops rows) | Add schema validation: assert that >90% of rows have non-empty `destinationIata`, `status`, `flight` |
| **Network unreachable** | Run fails | Retry once, then fallback |

### 5.2 System-level failures

| Failure mode | Current behavior | Recommended guard |
|-------------|-----------------|-------------------|
| **Stale file fallback** | Falls back to whatever file is on disk — could be days/weeks old | Add file freshness check: warn if file mtime > 6 hours old |
| **Scheduler drift** | `computeNextAlignedRun()` uses `Date.now()` — no NTP drift protection | Log actual run start time vs expected slot time; alert if drift > 2 min |
| **Process restart during run** | `cleanupStaleRuns()` archives stale "running" runs on init | Current behavior is correct |
| **Duplicate concurrent runs** | `runInFlight` flag + storage-level `RUN_ALREADY_IN_PROGRESS` check | Current behavior is correct |
| **FR24 API key rotation** | No detection — uses env var at startup | Consider: log API key prefix at startup for audit trail |

### 5.3 Data quality failures

| Failure mode | Impact | Guard |
|-------------|--------|-------|
| **Codeshare confusion** | Different flight codes for same physical flight → duplicate Duffel searches | Dedupe by `departureLocalIso + destinationIata` before task building |
| **Status text variation** | API may return `"En Route"`, `"Delayed"`, `"Departed"` — not handled by `normalizeStatus()` | Extend normalizer, add catch-all logging for unknown statuses |
| **Timezone mismatch** | API may return UTC timestamps vs. local — `coerceToDate` handles both but `buildLocalDateParts` must get the right timezone | Validate: if API returns offset-aware timestamps, ensure `dashboardTimezone` matches |

---

## 6. Phased Rollout Plan

### Phase 1: Local validation (1–2 days)

**Goal**: Prove FR24 API produces equivalent data to file input, with zero production risk.

1. **Add FR24 API retry/backoff** to `fetchJson()` — mirror the pattern from `duffelFetch()`.
2. **Add inter-request delay** (300ms default) in `fetchFr24ApiRows()`.
3. **Add response validation**: assert `destinationIata` non-empty on normalized rows, log dropped rows.
4. **Add source tagging**: include `fr24Source: "api" | "file"` on each row and in run metadata.
5. **Write comparison script**: `scripts/compare-fr24-sources.js` that:
   - Fetches API data for DXB + today
   - Parses file data
   - Compares row counts, field coverage, status distribution
   - Outputs diff report
6. **Write unit tests** for `normalizeApiFlight`, `normalizeStatus`, `extractFlightsArray`, `parseFr24File`.

**Acceptance**: Comparison script shows >95% overlap in flights (by `carrierCode+flightNumber+flightDate`) between API and file sources.

### Phase 2: Production with fallback (3–5 days)

**Goal**: Run API-first in production with automatic file fallback and full observability.

1. **Enable `FR24_API_ENABLED=true`** with `FR24_API_FALLBACK_TO_FILE=true`.
2. **Add minimum-row sanity check**: if API returns <20% of expected flights, log warning and fall back.
3. **Add credit/usage counter**: track calls per run, per day. Log running total. Warn at 80% monthly budget.
4. **Emit FR24 source events**: `fr24_source_selected { source: "api"|"file", rowCount, latencyMs, fallbackTriggered }`.
5. **Add health-check endpoint**: `GET /api/fr24/health` — tests API connectivity with a lightweight call.
6. **Add file freshness warning**: if fallback file mtime > 6 hours, log warning in dashboard.
7. **Monitor for 1 week**: compare API-sourced runs vs. historical file-sourced run metrics.

**Acceptance**: 7 consecutive days of API-primary runs with <5% fallback-to-file rate and zero data quality regressions.

### Phase 3: Full API mode (after Phase 2 validation)

**Goal**: Remove file dependency for production. File remains as emergency fallback only.

1. **Set `FR24_API_FALLBACK_TO_FILE=false`** (or keep `true` with explicit stale-file detection).
2. **Add pagination support** if FR24 API paginates (follow `next_page` / `cursor` patterns).
3. **Add credit budget alerting**: if daily usage projects to exceed monthly budget, reduce run frequency or alert.
4. **Add multi-airport concurrency**: optionally fetch airports in parallel (respecting rate limits).
5. **Consider caching**: cache FR24 responses for 5 min to avoid redundant calls during manual re-runs.
6. **Remove hardcoded file path fallback** from `resolveExistingPath` defaults in `config.js:39-42`.

**Acceptance**: 30 days of stable API-only operation with documented credit usage within budget.

---

## 7. Acceptance Tests & Checklist

### Unit tests

- [ ] `normalizeApiFlight()` — valid FR24 response → correct internal row
- [ ] `normalizeApiFlight()` — missing `destinationIata` → returns `null`
- [ ] `normalizeApiFlight()` — Unix timestamp (seconds) → correct local time
- [ ] `normalizeApiFlight()` — ISO string with offset → correct local time
- [ ] `normalizeStatus()` — all known variants: `"scheduled"`, `"Estimated dep. 3:00 PM"`, `"canceled"`, `"en route"`, `""`, `"Unknown"`
- [ ] `extractFlightsArray()` — `{ data: [...] }` → extracts array
- [ ] `extractFlightsArray()` — `{ departures: [...] }` → extracts array
- [ ] `extractFlightsArray()` — flat array → returns as-is
- [ ] `extractFlightsArray()` — `{}` → returns `[]`
- [ ] `parseFr24File()` — known file → correct row count and field values
- [ ] `filterFr24Rows()` — blocked airport filtered out
- [ ] `filterFr24Rows()` — `Canceled` status filtered out
- [ ] `parseFlightCode()` — `"EK209"` → `{ carrierCode: "EK", flightNumber: "209" }`
- [ ] `parseFlightCode()` — `"FZ1839"` → `{ carrierCode: "FZ", flightNumber: "1839" }`

### Integration tests

- [ ] `loadFr24Rows()` — API enabled, mock returns data → API rows used
- [ ] `loadFr24Rows()` — API enabled, mock throws → falls back to file (if enabled)
- [ ] `loadFr24Rows()` — API enabled, mock returns empty → falls back to file (if enabled)
- [ ] `loadFr24Rows()` — API disabled → file rows used
- [ ] `fetchFr24ApiRows()` — retry on 429 → succeeds on 2nd attempt
- [ ] `fetchFr24ApiRows()` — retry on 503 → succeeds on 3rd attempt
- [ ] `fetchFr24ApiRows()` — all retries exhausted → throws

### Comparison tests (Phase 1)

- [ ] API vs. file: >95% flight overlap by `carrierCode+flightNumber+flightDate`
- [ ] API vs. file: status distribution within 10% (Scheduled vs. Estimated vs. Canceled)
- [ ] API vs. file: no API rows with empty `destinationIata` or `airline`
- [ ] API vs. file: departure times match within ±2 minutes

### Production validation (Phase 2)

- [ ] 48 consecutive runs (24h) with API as primary source
- [ ] Fallback-to-file rate < 5%
- [ ] Zero dashboard rows with empty destination or status from API source
- [ ] FR24 API credit usage matches expected budget (±10%)
- [ ] Run latency increase < 3 seconds compared to file-only baseline
- [ ] Source tag correctly propagated to SSE events and storage

---

## 8. Minimal Patch Plan (PR-sized steps)

### PR 1: FR24 fetch hardening (no behavior change)
- Add retry/backoff to `fetchJson()` (3 attempts, exponential backoff with jitter)
- Add inter-request delay (300ms) in `fetchFr24ApiRows()`
- Add URL template validation in `assertRequiredConfig()`
- Estimated diff: ~60 lines in `lib/fr24.js`, ~5 lines in `lib/config.js`

### PR 2: Response validation + source tagging
- Add `normalizeApiFlight` validation (reject rows with empty `destinationIata`)
- Add `fr24Source` field to row output
- Add minimum-row sanity check (configurable threshold)
- Log dropped/invalid rows with details
- Estimated diff: ~40 lines in `lib/fr24.js`, ~10 lines in `lib/dashboard-runner.js`

### PR 3: Observability + health check
- Add `fr24_source_selected` event emission
- Add FR24 metrics to run completion events (source, rowCount, latency, fallbackTriggered)
- Add `GET /api/fr24/health` endpoint
- Add file freshness warning
- Estimated diff: ~50 lines across `lib/fr24.js`, `lib/dashboard-runner.js`, `server.js`

### PR 4: Credit tracking + budget alerting
- Add credit counter (in-memory, reset daily)
- Add configurable monthly budget + warning threshold
- Log credit usage per run
- Estimated diff: ~40 lines in `lib/fr24.js`, ~5 lines in `lib/config.js`

### PR 5: Comparison script + unit tests
- Add `scripts/compare-fr24-sources.js`
- Add test file(s) with unit tests for core normalization functions
- Estimated diff: ~200 lines (new files)

---

## Sources

- [FR24 API Overview](https://fr24api.flightradar24.com/)
- [FR24 API Endpoints](https://fr24api.flightradar24.com/docs/endpoints)
- [FR24 API Credit Overview](https://fr24api.flightradar24.com/docs/credit-overview)
- [FR24 API FAQ](https://fr24api.flightradar24.com/docs/faq)
- [FR24 Rate Limit Handling](https://support.fr24.com/support/solutions/articles/3000128181-how-do-i-handle-api-rate-limits-and-what-should-i-do-if-i-exceed-them-)
- [FR24 Subscription Tiers](https://support.fr24.com/support/solutions/articles/3000128167-what-different-types-of-api-subscriptions-are-available-)
- [Official FR24 JS SDK](https://github.com/Flightradar24/fr24api-sdk-js)
