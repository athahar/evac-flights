import test from "node:test";
import assert from "node:assert/strict";
import { createSearchAvailabilityService, __testables } from "../lib/search-availability.js";

const {
  getDateIsoInTimezone,
  getAllowedDateSet,
  splitBlockedDestinations,
  buildQuerySignature,
  sortAndTopOffers,
  mapOfferToSearchResult
} = __testables;

function makeConfig(overrides = {}) {
  return {
    searchEnabled: true,
    originAirports: ["DXB", "MCT"],
    dashboardTimezone: "Asia/Dubai",
    searchDateRangeDays: 7,
    searchMaxDestinations: 3,
    searchCacheTtlSeconds: 300,
    blocklist: { airports: [], countries: [] },
    dashboardExcludeTestAirline: true,
    paxAdults: 1,
    maxConnections: 1,
    defaultCabinClass: "economy",
    ...overrides
  };
}

test("signature normalization is order-independent after blocklist filtering", () => {
  const sigA = buildQuerySignature({
    origin: "DXB",
    departureDate: "2026-03-10",
    destinationsChecked: ["LHR", "CDG", "AMS"]
  });
  const sigB = buildQuerySignature({
    origin: "DXB",
    departureDate: "2026-03-10",
    destinationsChecked: ["AMS", "LHR", "CDG"]
  });

  assert.equal(sigA, sigB);
});

test("Dubai date range helper returns today..plus N days", () => {
  const todayDubai = getDateIsoInTimezone(new Date(), "Asia/Dubai");
  const allowed = getAllowedDateSet("Asia/Dubai", 7);

  assert.equal(allowed.size, 8);
  assert.equal(allowed.has(todayDubai), true);
});

test("deterministic ranking keeps top 3 by price then departAt then offerId", () => {
  const ranked = sortAndTopOffers([
    { offerId: "z", priceAmount: "500", departAt: "2026-03-10T09:30:00Z" },
    { offerId: "a", priceAmount: "400", departAt: "2026-03-10T09:20:00Z" },
    { offerId: "b", priceAmount: "400", departAt: "2026-03-10T09:20:00Z" },
    { offerId: "c", priceAmount: "400", departAt: "2026-03-10T09:15:00Z" },
    { offerId: "d", priceAmount: "999", departAt: "2026-03-10T09:00:00Z" }
  ], 3);

  assert.deepEqual(ranked.map((x) => x.offerId), ["c", "a", "b"]);
});

test("blocklist filtering marks blocked destinations correctly", () => {
  const airports = new Map([
    ["LHR", { iata: "LHR", country: "GB" }],
    ["CDG", { iata: "CDG", country: "FR" }],
    ["DOH", { iata: "DOH", country: "QA" }]
  ]);

  const split = splitBlockedDestinations(
    ["LHR", "CDG", "DOH"],
    airports,
    { airports: ["CDG"], countries: ["QA"] }
  );

  assert.deepEqual(split.checked, ["LHR"]);
  assert.deepEqual(split.blocked.sort(), ["CDG", "DOH"]);
});

test("cache hit returns cached payload and does not persist new row", async () => {
  let saveCalls = 0;
  const storage = {
    async getRecentSearchBySignature() {
      return {
        id: "cached-id",
        pairsChecked: 1,
        offersFound: 1,
        durationMs: 10,
        results: [{ destinationIata: "LHR", destinationName: "Heathrow", offers: [] }],
        errors: []
      };
    },
    async saveSearchQuery() {
      saveCalls += 1;
      return "live-id";
    }
  };

  const service = createSearchAvailabilityService({
    config: makeConfig(),
    storage,
    airportsByIata: new Map([["LHR", { iata: "LHR", name: "Heathrow Airport", city: "London", country: "GB" }]])
  });

  const departureDate = getDateIsoInTimezone(new Date(), "Asia/Dubai");
  const result = await service.searchAvailability({
    origin: "DXB",
    departureDate,
    destinations: ["LHR"]
  });

  assert.equal(result.source, "cache");
  assert.equal(result.searchId, "cached-id");
  assert.equal(saveCalls, 0);
});

test("missing airline mapping yields websiteMode=dash and empty bookingUrl", () => {
  const mapped = mapOfferToSearchResult({
    offer: {
      id: "off_1",
      owner: { name: "Unknown Air" },
      total_amount: "420.00",
      total_currency: "USD",
      slices: [
        {
          segments: [
            {
              departing_at: "2026-03-10T10:00:00Z",
              arriving_at: "2026-03-10T14:00:00Z",
              marketing_carrier: { iata_code: "" },
              operating_carrier: { iata_code: "" }
            }
          ]
        }
      ]
    },
    origin: "MCT",
    destinationIata: "LHR",
    departureDate: "2026-03-10"
  });

  assert.equal(mapped.websiteMode, "dash");
  assert.equal(mapped.bookingUrl, "");
});
