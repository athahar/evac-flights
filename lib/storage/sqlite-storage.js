import {
  createDashboardRun,
  updateDashboardRunProgress,
  completeDashboardRun,
  insertDashboardRunRows,
  getLatestCompletedDashboardRun,
  getLatestDashboardRun,
  getDashboardRunRows,
  setSetting,
  clearAvailabilityData,
  insertSearchQuery,
  getLatestSearchQueryBySignature
} from "../db.js";

function normalizeDbRow(row) {
  return {
    id: row.id,
    runId: row.run_id,
    flightDate: row.flight_date,
    departureTimeLocal: row.departure_time_local,
    departureLocalIso: row.departure_local_iso,
    airline: row.airline,
    carrierCode: row.carrier_code,
    marketingCarrierCode: row.marketing_carrier_code || "",
    flightNumber: row.flight_number,
    origin: row.origin,
    destinationCity: row.destination_city,
    destinationIata: row.destination_iata,
    fr24Status: row.fr24_status,
    availabilityStatus: row.availability_status,
    bookabilityStatus: row.bookability_status || "PENDING",
    offerRequestId: row.offer_request_id || "",
    availableOfferCount: row.available_offer_count,
    matchedOfferCount: row.matched_offer_count,
    seatsMin: row.seats_min,
    priceAmount: row.price_amount,
    priceCurrency: row.price_currency,
    offerAirline: row.offer_airline,
    topOffers: (() => {
      if (!row.top_offers_json) return [];
      if (Array.isArray(row.top_offers_json)) return row.top_offers_json;
      try {
        const parsed = JSON.parse(row.top_offers_json);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
    bookingUrl: row.booking_url,
    websiteMode: row.website_mode || (row.booking_url ? "link" : "dash"),
    bookingNeedsVerify: Boolean(row.booking_needs_verify),
    observedAt: row.observed_at
  };
}

function normalizeDbRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    status: run.status,
    origin: run.origin,
    lookaheadDays: run.lookahead_days,
    totalTasks: run.total_tasks,
    completedTasks: run.completed_tasks,
    nextRunAt: run.next_run_at,
    error: run.error || ""
  };
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeSearchQueryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    querySignature: row.query_signature,
    origin: row.origin,
    departureDate: row.departure_date,
    destinations: parseJson(row.destinations_json, []),
    destinationsBlocked: parseJson(row.destinations_blocked_json, []),
    source: row.source || "live",
    pairsChecked: row.pairs_checked || 0,
    offersFound: row.offers_found || 0,
    durationMs: row.duration_ms || 0,
    errors: parseJson(row.errors_json, []),
    results: parseJson(row.results_json, [])
  };
}

export function createSqliteStorage(db) {
  return {
    async createRun(payload) {
      return createDashboardRun(db, payload);
    },

    async updateRunProgress(runId, payload) {
      return updateDashboardRunProgress(db, runId, payload);
    },

    async insertFlights(runId, rows) {
      return insertDashboardRunRows(db, runId, rows);
    },

    async finalizeRun(runId, payload) {
      completeDashboardRun(db, runId, payload);
      if (payload.status === "completed") {
        setSetting(db, "dashboard_last_completed_run_id", String(runId));
        setSetting(db, "dashboard_last_completed_at", payload.completedAt);
      }
      if (payload.nextRunAt) {
        setSetting(db, "dashboard_next_run_at", payload.nextRunAt);
      }
    },

    async getActiveSnapshot() {
      const run = getLatestCompletedDashboardRun(db);
      if (!run) return null;
      const rows = getDashboardRunRows(db, run.id);
      return {
        run: normalizeDbRun(run),
        rows: rows.map(normalizeDbRow)
      };
    },

    async getLatestRun() {
      return getLatestDashboardRun(db) || null;
    },

    async clearAllData() {
      return clearAvailabilityData(db);
    },

    async saveSearchQuery(payload) {
      return insertSearchQuery(db, {
        createdAt: payload.createdAt,
        querySignature: payload.querySignature,
        origin: payload.origin,
        departureDate: payload.departureDate,
        destinationsJson: JSON.stringify(payload.destinations || []),
        destinationsBlockedJson: JSON.stringify(payload.destinationsBlocked || []),
        source: payload.source || "live",
        pairsChecked: payload.pairsChecked || 0,
        offersFound: payload.offersFound || 0,
        durationMs: payload.durationMs || 0,
        errorsJson: JSON.stringify(payload.errors || []),
        resultsJson: JSON.stringify(payload.results || [])
      });
    },

    async getRecentSearchBySignature(querySignature, maxAgeSeconds) {
      const row = getLatestSearchQueryBySignature(db, querySignature);
      if (!row) return null;

      const createdAtMs = Date.parse(String(row.created_at || ""));
      if (!Number.isFinite(createdAtMs)) return null;
      if ((Date.now() - createdAtMs) > Math.max(0, maxAgeSeconds) * 1000) return null;

      return normalizeSearchQueryRow(row);
    }
  };
}
