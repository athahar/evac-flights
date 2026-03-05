import crypto from "node:crypto";
import { getRouteEndpoints, isOfferAllowed } from "./filter.js";
import { searchOffers } from "./duffel.js";
import { hasSeen, runFinish, runStart, setSetting, upsertSeen } from "./db.js";
import { sendAlertEmail } from "./email.js";

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function datePlusDays(days) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + days);
  return now;
}

function fingerprintOffer(normalized) {
  return crypto
    .createHash("sha256")
    .update(
      [
        normalized.ownerCode,
        normalized.origin,
        normalized.destination,
        normalized.departAt,
        normalized.totalAmount,
        normalized.totalCurrency,
        normalized.routePath
      ].join("|")
    )
    .digest("hex");
}

function normalizeOffer(offer) {
  const endpoints = getRouteEndpoints(offer);
  const segments = (offer?.slices || []).flatMap((slice) => slice?.segments || []);
  const departAt = segments[0]?.departing_at || offer?.slices?.[0]?.departing_at || "";
  const routePath = segments
    .map((s) => `${s?.origin?.iata_code || "?"}-${s?.destination?.iata_code || "?"}`)
    .join(",");

  return {
    offerId: offer?.id || "",
    ownerCode: offer?.owner?.iata_code || "",
    ownerName: offer?.owner?.name || "",
    origin: endpoints.origin,
    destination: endpoints.destination,
    departAt,
    totalAmount: offer?.total_amount || "",
    totalCurrency: offer?.total_currency || "",
    routePath
  };
}

function pickDepartureDate(inputDate, lookaheadDays) {
  if (inputDate) return inputDate;
  return formatDate(datePlusDays(lookaheadDays));
}

export async function scanOnce({ db, config, options = {} }) {
  const startedAt = new Date().toISOString();
  const runId = runStart(db, startedAt);

  const origins = Array.isArray(options.origins) && options.origins.length > 0 ? options.origins : config.originAirports;
  const destinations = Array.isArray(options.destinations) && options.destinations.length > 0 ? options.destinations : config.destinations;
  const maxConnections = Number.isInteger(options.maxConnections) ? options.maxConnections : config.maxConnections;
  const departureDate = pickDepartureDate(options.departureDate, config.lookaheadDays);

  const summary = {
    runId,
    startedAt,
    completedAt: "",
    departureDate,
    scannedPairs: 0,
    offersSeen: 0,
    offersMatched: 0,
    newAlerts: 0,
    emailed: 0,
    errors: [],
    sampleMatches: []
  };

  try {
    const matchedOffers = [];

    for (const origin of origins) {
      for (const destination of destinations) {
        if (origin === destination) continue;

        summary.scannedPairs += 1;

        try {
          const result = await searchOffers(config, {
            origin,
            destination,
            departureDate,
            adults: config.paxAdults,
            maxConnections,
            cabinClass: config.defaultCabinClass
          });

          const offers = result.offers || [];
          summary.offersSeen += offers.length;

          for (const offer of offers) {
            const decision = isOfferAllowed(offer, config.blocklist);
            if (!decision.allowed) {
              continue;
            }

            const normalized = normalizeOffer(offer);
            if (!normalized.origin || !normalized.destination) {
              continue;
            }

            matchedOffers.push(normalized);
          }
        } catch (err) {
          summary.errors.push(`search ${origin}->${destination}: ${err.message}`);
        }
      }
    }

    summary.offersMatched = matchedOffers.length;

    const nowIso = new Date().toISOString();
    const fresh = [];
    for (const offer of matchedOffers) {
      const fingerprint = fingerprintOffer(offer);
      const payloadJson = JSON.stringify(offer);
      const alreadySeen = hasSeen(db, fingerprint);
      upsertSeen(db, fingerprint, nowIso, payloadJson);
      if (!alreadySeen) {
        fresh.push(offer);
      }
    }

    summary.newAlerts = fresh.length;
    summary.sampleMatches = fresh.slice(0, 10);

    if (fresh.length > 0) {
      await sendAlertEmail(config, fresh.slice(0, 25), {
        origins,
        departureDate
      });
      summary.emailed = 1;
    }

    summary.completedAt = new Date().toISOString();

    runFinish(db, runId, {
      completedAt: summary.completedAt,
      scannedPairs: summary.scannedPairs,
      offersSeen: summary.offersSeen,
      offersMatched: summary.offersMatched,
      newAlerts: summary.newAlerts,
      emailed: summary.emailed,
      error: summary.errors.length > 0 ? summary.errors.join(" | ") : null
    });

    setSetting(db, "last_run_at", summary.completedAt);

    return summary;
  } catch (err) {
    summary.completedAt = new Date().toISOString();
    summary.errors.push(`fatal: ${err.message}`);

    runFinish(db, runId, {
      completedAt: summary.completedAt,
      scannedPairs: summary.scannedPairs,
      offersSeen: summary.offersSeen,
      offersMatched: summary.offersMatched,
      newAlerts: summary.newAlerts,
      emailed: summary.emailed,
      error: summary.errors.join(" | ")
    });

    throw err;
  }
}
