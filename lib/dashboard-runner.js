import { EventEmitter } from "node:events";
import {
  completeDashboardRun,
  createDashboardRun,
  getLatestCompletedDashboardRun,
  getLatestDashboardRun,
  getDashboardRunRows,
  insertDashboardRunRows,
  setSetting,
  updateDashboardRunProgress
} from "./db.js";
import { filterFr24Rows, getDateRangeIso, parseFr24File } from "./fr24.js";
import { isCargoOperator, resolveAirlineBooking } from "./airlineLinks.js";
import { isOfferAllowed } from "./filter.js";
import { searchOffers } from "./duffel.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeNumber(value) {
  const text = String(value || "").toUpperCase().trim();
  if (!text) return "";
  return text.replace(/^0+/, "") || "0";
}

function getSegmentCarrierCode(segment) {
  return String(
    segment?.marketing_carrier?.iata_code ||
      segment?.marketing_carrier_iata_code ||
      segment?.operating_carrier?.iata_code ||
      ""
  )
    .trim()
    .toUpperCase();
}

function getSegmentFlightNumber(segment) {
  return normalizeNumber(
    segment?.marketing_carrier_flight_number ||
      segment?.flight_number ||
      segment?.number ||
      ""
  );
}

function getOfferSegments(offer) {
  return (offer?.slices || []).flatMap((slice) => slice?.segments || []);
}

function parseAvailableSeats(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function getOfferMinAvailableSeats(offer) {
  const segments = getOfferSegments(offer);
  if (!segments.length) return null;

  const values = segments
    .map((segment) => parseAvailableSeats(segment?.available_seats))
    .filter((v) => Number.isInteger(v));

  if (!values.length) return null;
  return Math.min(...values);
}

function dedupeOffers(offers) {
  const seen = new Set();
  const out = [];
  for (const offer of offers) {
    const segments = getOfferSegments(offer);
    const first = segments[0] || {};
    const key = [
      offer?.id || "",
      offer?.owner?.iata_code || "",
      first?.departing_at || "",
      offer?.total_amount || "",
      offer?.total_currency || ""
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(offer);
  }
  return out;
}

function getBestOffer(offers) {
  if (!offers || offers.length === 0) return null;
  return offers
    .slice()
    .sort((a, b) => {
      const pa = Number.parseFloat(a?.total_amount || "99999999");
      const pb = Number.parseFloat(b?.total_amount || "99999999");
      return pa - pb;
    })[0];
}

function mapOfferSummary(offer) {
  const segments = getOfferSegments(offer);
  return {
    offerAirline: offer?.owner?.name || offer?.owner?.iata_code || "",
    priceAmount: offer?.total_amount || "",
    priceCurrency: offer?.total_currency || "",
    segmentCount: segments.length,
    seatsMin: getOfferMinAvailableSeats(offer)
  };
}

function mapDispatcherOffer(offer) {
  const segments = getOfferSegments(offer);
  const first = segments[0] || {};
  return {
    offerId: offer?.id || "",
    carrierCode: offer?.owner?.iata_code || "",
    carrierName: offer?.owner?.name || "",
    departAt: first?.departing_at || "",
    priceAmount: offer?.total_amount || "",
    priceCurrency: offer?.total_currency || "",
    segments: segments.length
  };
}

function getCheapestOffers(offers, limit = 3) {
  return offers
    .slice()
    .sort((a, b) => {
      const pa = Number.parseFloat(a?.total_amount || "99999999");
      const pb = Number.parseFloat(b?.total_amount || "99999999");
      return pa - pb;
    })
    .slice(0, limit);
}

function rowId(row) {
  return [row.flightDate, row.flight, row.destinationIata, row.timeLocal].join("|");
}

function toDashboardRow(baseRow, origin, observedAt) {
  const booking = resolveAirlineBooking({
    airlineName: baseRow.airline,
    carrierCode: baseRow.carrierCode,
    marketingCarrierCode: "",
    from: origin,
    to: baseRow.destinationIata,
    date: baseRow.flightDate
  });

  return {
    id: rowId(baseRow),
    flightDate: baseRow.flightDate,
    departureTimeLocal: baseRow.timeLocal,
    departureLocalIso: baseRow.departureLocalIso,
    airline: baseRow.airline,
    carrierCode: baseRow.carrierCode,
    marketingCarrierCode: "",
    flightNumber: baseRow.flightNumber,
    origin,
    destinationCity: baseRow.destinationCity,
    destinationIata: baseRow.destinationIata,
    fr24Status: baseRow.status,
    availabilityStatus: "PENDING",
    bookabilityStatus: "PENDING",
    offerRequestId: "",
    availableOfferCount: 0,
    matchedOfferCount: 0,
    seatsMin: null,
    priceAmount: "",
    priceCurrency: "",
    offerAirline: "",
    topOffers: [],
    bookingUrl: booking.bookingUrl,
    websiteMode: booking.websiteMode,
    bookingNeedsVerify: Boolean(booking.bookingNeedsVerify),
    observedAt
  };
}

function normalizeDbRow(row) {
  const rawRow = {
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

  // Backfill-at-read for rows saved before airline link mapping fixes.
  if (!rawRow.bookingUrl || rawRow.websiteMode === "dash") {
    const resolved = resolveAirlineBooking({
      airlineName: rawRow.airline,
      carrierCode: rawRow.carrierCode,
      marketingCarrierCode: rawRow.marketingCarrierCode,
      from: rawRow.origin,
      to: rawRow.destinationIata,
      date: rawRow.flightDate
    });
    if (resolved.websiteMode !== "dash") {
      rawRow.bookingUrl = resolved.bookingUrl;
      rawRow.websiteMode = resolved.websiteMode;
      rawRow.bookingNeedsVerify = Boolean(resolved.bookingNeedsVerify);
    }
  }

  return rawRow;
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

function computeNextRunAtIso(intervalMinutes) {
  return new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString();
}

function statusRank(value) {
  if (value === "AVAILABLE_EXACT") return 1;
  if (value === "AVAILABLE_ROUTE") return 2;
  if (value === "NO_OFFER") return 3;
  if (value === "ERROR") return 4;
  return 5;
}

function bookabilityRank(value) {
  if (value === "BOOKABLE_NOW") return 1;
  if (value === "NOT_BOOKABLE_NOW") return 2;
  if (value === "ERROR") return 3;
  return 4;
}

function sortRowsForDisplay(rows) {
  return rows
    .slice()
    .sort((a, b) => {
      const bookabilityDelta = bookabilityRank(a.bookabilityStatus) - bookabilityRank(b.bookabilityStatus);
      if (bookabilityDelta !== 0) return bookabilityDelta;
      const rankDelta = statusRank(a.availabilityStatus) - statusRank(b.availabilityStatus);
      if (rankDelta !== 0) return rankDelta;
      const aSeats = Number.isInteger(a.seatsMin) ? a.seatsMin : 999;
      const bSeats = Number.isInteger(b.seatsMin) ? b.seatsMin : 999;
      if (aSeats !== bSeats) return aSeats - bSeats;
      if (b.availableOfferCount !== a.availableOfferCount) return b.availableOfferCount - a.availableOfferCount;
      return String(a.departureLocalIso).localeCompare(String(b.departureLocalIso));
    });
}

function buildTasks(rows) {
  const map = new Map();
  rows.forEach((row, index) => {
    const key = `${row.flightDate}|${row.destinationIata}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        flightDate: row.flightDate,
        destinationIata: row.destinationIata,
        rowIndexes: []
      });
    }
    map.get(key).rowIndexes.push(index);
  });
  return [...map.values()];
}

function getRowMatchingSegment(offer, row) {
  const targetCarrier = String(row.carrierCode || "").toUpperCase();
  const targetFlightNumber = normalizeNumber(row.flightNumber);
  const targetOrigin = String(row.origin || "").toUpperCase();
  const targetDestination = String(row.destinationIata || "").toUpperCase();
  const segments = getOfferSegments(offer);

  const exact = segments.find((segment) => {
    const segOrigin = String(segment?.origin?.iata_code || "").toUpperCase();
    const segDestination = String(segment?.destination?.iata_code || "").toUpperCase();
    const segCarrier = getSegmentCarrierCode(segment);
    const segFlightNumber = getSegmentFlightNumber(segment);
    return (
      segOrigin === targetOrigin &&
      segDestination === targetDestination &&
      segCarrier === targetCarrier &&
      segFlightNumber === targetFlightNumber
    );
  });
  if (exact) return exact;

  const route = segments.find((segment) => {
    const segOrigin = String(segment?.origin?.iata_code || "").toUpperCase();
    const segDestination = String(segment?.destination?.iata_code || "").toUpperCase();
    return segOrigin === targetOrigin && segDestination === targetDestination;
  });
  if (route) return route;

  return segments[0] || null;
}

function getRowMarketingCarrierCode(offers, row) {
  for (const offer of offers || []) {
    const segment = getRowMatchingSegment(offer, row);
    const code = getSegmentCarrierCode(segment);
    if (code) return code;
  }
  return "";
}

function refreshRowBookingLink(row) {
  const booking = resolveAirlineBooking({
    airlineName: row.airline,
    carrierCode: row.carrierCode,
    marketingCarrierCode: row.marketingCarrierCode,
    from: row.origin,
    to: row.destinationIata,
    date: row.flightDate
  });
  row.bookingUrl = booking.bookingUrl;
  row.websiteMode = booking.websiteMode;
  row.bookingNeedsVerify = Boolean(booking.bookingNeedsVerify);
}

function matchOffersForRow(offers, row) {
  const targetCarrier = String(row.carrierCode || "").toUpperCase();
  const targetFlightNumber = normalizeNumber(row.flightNumber);
  const targetOrigin = String(row.origin || "").toUpperCase();
  const targetDestination = String(row.destinationIata || "").toUpperCase();

  const exact = [];

  for (const offer of offers) {
    const segments = getOfferSegments(offer);
    const hasExact = segments.some((segment) => {
      const segOrigin = String(segment?.origin?.iata_code || "").toUpperCase();
      const segDestination = String(segment?.destination?.iata_code || "").toUpperCase();
      const segCarrier = getSegmentCarrierCode(segment);
      const segFlightNumber = getSegmentFlightNumber(segment);
      return (
        segOrigin === targetOrigin &&
        segDestination === targetDestination &&
        segCarrier === targetCarrier &&
        segFlightNumber === targetFlightNumber
      );
    });

    if (hasExact) exact.push(offer);
  }

  if (exact.length > 0) {
    return {
      availabilityStatus: "AVAILABLE_EXACT",
      matchedOffers: exact,
      availableOfferCount: offers.length,
      matchedOfferCount: exact.length
    };
  }

  if (offers.length > 0) {
    return {
      availabilityStatus: "AVAILABLE_ROUTE",
      matchedOffers: offers,
      availableOfferCount: offers.length,
      matchedOfferCount: 0
    };
  }

  return {
    availabilityStatus: "NO_OFFER",
    matchedOffers: [],
    availableOfferCount: 0,
    matchedOfferCount: 0
  };
}

export function createDashboardRunner({ db, config }) {
  const events = new EventEmitter();
  let runInFlight = false;
  let currentRun = null;
  let scheduler = null;
  let nextRunAt = getLatestDashboardRun(db)?.next_run_at || null;

  async function runNow(reason = "manual") {
    if (runInFlight) {
      return { status: "skipped", reason: "run_in_progress" };
    }

    runInFlight = true;
    const startedAt = new Date().toISOString();
    const observedAt = startedAt;
    const nextAt = computeNextRunAtIso(config.dashboardIntervalMinutes);

    const allowedDates = getDateRangeIso(config.dashboardTimezone, config.dashboardLookaheadDays);
    const parsedRows = parseFr24File(config.fr24InputFile);
    const filteredRows = filterFr24Rows(parsedRows, {
      blockedAirports: config.blocklist?.airports || [],
      allowedStatuses: ["Scheduled", "Estimated"],
      allowedDates
    });

    const origin = config.originAirports[0];
    const dashboardRows = filteredRows
      .filter((row) => !isCargoOperator(row.airline))
      .map((row) => toDashboardRow(row, origin, observedAt));
    const tasks = buildTasks(dashboardRows);

    const runId = createDashboardRun(db, {
      startedAt,
      status: "running",
      origin,
      lookaheadDays: config.dashboardLookaheadDays,
      totalTasks: tasks.length,
      completedTasks: 0,
      nextRunAt: nextAt
    });

    currentRun = {
      id: runId,
      startedAt,
      status: "running",
      reason,
      origin,
      lookaheadDays: config.dashboardLookaheadDays,
      totalTasks: tasks.length,
      completedTasks: 0,
      nextRunAt: nextAt,
      rows: sortRowsForDisplay(dashboardRows),
      error: ""
    };

    events.emit("run_started", {
      currentRun,
      mostRecent: getMostRecent()
    });

    const duffelConfig = {
      duffelToken: config.duffelToken,
      duffelBaseUrl: config.duffelBaseUrl,
      duffelVersion: config.duffelVersion,
      duffelRateLimitPerMinute: config.duffelRateLimitPerMinute,
      duffelRateWindowMs: config.duffelRateWindowMs,
      duffelLogs: config.duffelLogs,
      duffelLogPayloads: config.duffelLogPayloads,
      duffelMaxAttempts: 6,
      duffelBackoffMs: 2500
    };

    try {
      for (const task of tasks) {
        let allowedOffers = [];
        let taskError = "";
        let offerRequestId = "";
        let bookabilityStatus = "NOT_BOOKABLE_NOW";
        let topOffers = [];

        try {
          const result = await searchOffers(duffelConfig, {
            origin,
            destination: task.destinationIata,
            departureDate: task.flightDate,
            adults: config.paxAdults,
            maxConnections: config.maxConnections,
            cabinClass: config.defaultCabinClass
          });
          offerRequestId = result.requestId || "";

          const allAllowed = (result.offers || [])
            .filter((offer) => isOfferAllowed(offer, config.blocklist).allowed)
            .filter((offer) => !config.dashboardExcludeTestAirline || (offer?.owner?.name || "") !== "Duffel Airways");

          allowedOffers = dedupeOffers(allAllowed);
          topOffers = getCheapestOffers(allowedOffers, 3).map(mapDispatcherOffer);
          bookabilityStatus = allowedOffers.length > 0 ? "BOOKABLE_NOW" : "NOT_BOOKABLE_NOW";
        } catch (err) {
          taskError = err.message;
          bookabilityStatus = "ERROR";
        }

        const changedRows = [];

        for (const rowIndex of task.rowIndexes) {
          const row = dashboardRows[rowIndex];
          row.bookabilityStatus = bookabilityStatus;
          row.offerRequestId = offerRequestId;
          row.topOffers = topOffers;

          if (taskError) {
            row.availabilityStatus = "ERROR";
            row.availableOfferCount = 0;
            row.matchedOfferCount = 0;
            row.marketingCarrierCode = "";
            row.seatsMin = null;
            row.priceAmount = "";
            row.priceCurrency = "";
            row.offerAirline = "";
          } else {
            const match = matchOffersForRow(allowedOffers, row);
            row.availabilityStatus = match.availabilityStatus;
            row.availableOfferCount = match.availableOfferCount;
            row.matchedOfferCount = match.matchedOfferCount;

            const best = getBestOffer(match.matchedOffers);
            if (best) {
              const summary = mapOfferSummary(best);
              row.marketingCarrierCode = getRowMarketingCarrierCode(match.matchedOffers, row) || "";
              row.priceAmount = summary.priceAmount;
              row.priceCurrency = summary.priceCurrency;
              row.offerAirline = summary.offerAirline;
              row.seatsMin = summary.seatsMin;
            } else {
              row.marketingCarrierCode = "";
              row.seatsMin = null;
              row.priceAmount = "";
              row.priceCurrency = "";
              row.offerAirline = "";
            }
          }

          refreshRowBookingLink(row);
          changedRows.push({ ...row });
        }

        currentRun.completedTasks += 1;
        currentRun.rows = sortRowsForDisplay(dashboardRows);

        updateDashboardRunProgress(db, runId, {
          totalTasks: tasks.length,
          completedTasks: currentRun.completedTasks,
          nextRunAt: nextAt
        });

        events.emit("task_progress", {
          runId,
          completedTasks: currentRun.completedTasks,
          totalTasks: tasks.length,
          destinationIata: task.destinationIata,
          flightDate: task.flightDate,
          error: taskError,
          changedRows
        });

        if (config.dashboardRunDelayMs > 0) {
          // Rate limiting protection between destination checks.
          // eslint-disable-next-line no-await-in-loop
          await sleep(config.dashboardRunDelayMs);
        }
      }

      const completedAt = new Date().toISOString();
      const finalRows = sortRowsForDisplay(dashboardRows).map((row) => ({ ...row, observedAt: completedAt }));

      insertDashboardRunRows(db, runId, finalRows);
      completeDashboardRun(db, runId, {
        completedAt,
        status: "completed",
        totalTasks: tasks.length,
        completedTasks: tasks.length,
        nextRunAt: nextAt,
        error: null
      });

      setSetting(db, "dashboard_last_completed_run_id", String(runId));
      setSetting(db, "dashboard_last_completed_at", completedAt);
      setSetting(db, "dashboard_next_run_at", nextAt);

      nextRunAt = nextAt;
      currentRun = null;

      events.emit("run_completed", {
        runId,
        completedAt,
        nextRunAt,
        mostRecent: getMostRecent()
      });

      return { status: "ok", runId };
    } catch (err) {
      const completedAt = new Date().toISOString();

      completeDashboardRun(db, runId, {
        completedAt,
        status: "failed",
        totalTasks: tasks.length,
        completedTasks: currentRun?.completedTasks || 0,
        nextRunAt: nextAt,
        error: err.message
      });

      currentRun = {
        ...(currentRun || {}),
        status: "failed",
        error: err.message
      };

      events.emit("run_failed", {
        runId,
        error: err.message,
        nextRunAt: nextAt
      });

      throw err;
    } finally {
      runInFlight = false;
    }
  }

  function getMostRecent() {
    const run = getLatestCompletedDashboardRun(db);
    if (!run) return null;
    return {
      run: normalizeDbRun(run),
      rows: getDashboardRunRows(db, run.id).map(normalizeDbRow)
    };
  }

  function getState() {
    return {
      schedulerRunning: Boolean(scheduler),
      nextRunAt,
      currentRun,
      mostRecent: getMostRecent()
    };
  }

  function startScheduler() {
    if (scheduler) return;

    const intervalMs = Math.max(1, config.dashboardIntervalMinutes) * 60 * 1000;

    nextRunAt = computeNextRunAtIso(config.dashboardIntervalMinutes);
    setSetting(db, "dashboard_next_run_at", nextRunAt);

    runNow("initial").catch((err) => {
      console.error(`[dashboard-run] ${err.message}`);
    });

    scheduler = setInterval(() => {
      runNow("scheduled").catch((err) => {
        console.error(`[dashboard-run] ${err.message}`);
      });
      nextRunAt = computeNextRunAtIso(config.dashboardIntervalMinutes);
      setSetting(db, "dashboard_next_run_at", nextRunAt);
      events.emit("scheduler_tick", { nextRunAt });
    }, intervalMs);
  }

  function stopScheduler() {
    if (!scheduler) return;
    clearInterval(scheduler);
    scheduler = null;
    events.emit("scheduler_stopped", {});
  }

  return {
    events,
    getState,
    getMostRecent,
    runNow,
    startScheduler,
    stopScheduler
  };
}
