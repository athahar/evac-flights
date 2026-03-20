import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extractFlightsArray,
  filterFr24Rows,
  loadFr24Data,
  normalizeApiFlight,
  normalizeScrapeApiFlight,
  normalizeStatus,
  parseFlightCode,
  parseFr24File
} from "../lib/fr24.js";

test("normalizeApiFlight returns normalized row for valid input", () => {
  const row = normalizeApiFlight(
    {
      departure: { scheduled: "2026-03-05T10:15:00+04:00" },
      destination: { iata: "LHR", city: "London" },
      flight_number: "EK209",
      airline_name: "Emirates",
      status: "scheduled"
    },
    "Asia/Dubai"
  );

  assert.ok(row);
  assert.equal(row.flightDate, "2026-03-05");
  assert.equal(row.timeLocal, "10:15 AM");
  assert.equal(row.departureLocalIso, "2026-03-05T10:15:00");
  assert.equal(row.flight, "EK209");
  assert.equal(row.carrierCode, "EK");
  assert.equal(row.flightNumber, "209");
  assert.equal(row.destinationIata, "LHR");
  assert.equal(row.status, "Scheduled");
});

test("normalizeApiFlight returns null when destination IATA is missing", () => {
  const row = normalizeApiFlight(
    {
      departure: { scheduled: "2026-03-05T10:15:00+04:00" },
      flight_number: "EK209"
    },
    "Asia/Dubai"
  );
  assert.equal(row, null);
});

test("normalizeApiFlight handles unix timestamp departures", () => {
  const row = normalizeApiFlight(
    {
      scheduled_departure: 1704067200,
      destination: { iata: "JFK" },
      flight_number: "EK203"
    },
    "Asia/Dubai"
  );
  assert.ok(row);
  assert.equal(row.departureLocalIso, "2024-01-01T04:00:00");
  assert.equal(row.flightDate, "2024-01-01");
});

test("normalizeApiFlight handles ISO timestamp with offset", () => {
  const row = normalizeApiFlight(
    {
      scheduled_departure: "2026-03-05T23:40:00+04:00",
      destination: { iata: "CDG" },
      flight_number: "EK73"
    },
    "Asia/Dubai"
  );
  assert.ok(row);
  assert.equal(row.flightDate, "2026-03-05");
  assert.equal(row.timeLocal, "11:40 PM");
});

test("normalizeStatus handles known mappings and passthrough", () => {
  assert.equal(normalizeStatus("scheduled"), "Scheduled");
  assert.equal(normalizeStatus("Estimated dep. 3:00 PM"), "Estimated");
  assert.equal(normalizeStatus("canceled"), "Canceled");
  assert.equal(normalizeStatus("delayed"), "Estimated");
  assert.equal(normalizeStatus("Delayed"), "Estimated");
  assert.equal(normalizeStatus("en route"), "en route");
  assert.equal(normalizeStatus(""), "");
  assert.equal(normalizeStatus("Unknown"), "Unknown");
});

test("extractFlightsArray handles common response shapes", () => {
  assert.deepEqual(extractFlightsArray({ data: [1, 2] }, ""), [1, 2]);
  assert.deepEqual(extractFlightsArray({ departures: ["a"] }, ""), ["a"]);
  assert.deepEqual(extractFlightsArray([9, 8], ""), [9, 8]);
  assert.deepEqual(extractFlightsArray({}, ""), []);
});

test("parseFr24File parses a small inline fixture", () => {
  const fixture = [
    "Thursday, Mar 05",
    "11:20 AM\tEK209",
    "Athens (ATH)",
    "Emirates\tBoeing 777",
    "Scheduled",
    "11:50 AM\tFZ1839",
    "Warsaw (WAW)",
    "flydubai\tBoeing 737",
    "Estimated dep. 11:55 AM"
  ].join("\n");
  const tmpFile = path.join(os.tmpdir(), `fr24-fixture-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  fs.writeFileSync(tmpFile, fixture, "utf-8");

  const rows = parseFr24File(tmpFile, { referenceYear: 2026 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].flight, "EK209");
  assert.equal(rows[0].destinationIata, "ATH");
  assert.equal(rows[0].status, "Scheduled");
  assert.equal(rows[1].flight, "FZ1839");
  assert.equal(rows[1].destinationIata, "WAW");
  assert.equal(rows[1].status, "Estimated dep. 11:55 AM");

  fs.unlinkSync(tmpFile);
});

test("parseFlightCode handles mixed carrier formats", () => {
  assert.deepEqual(parseFlightCode("EK209"), { carrierCode: "EK", flightNumber: "209" });
  assert.deepEqual(parseFlightCode("FZ1839"), { carrierCode: "FZ", flightNumber: "1839" });
  assert.deepEqual(parseFlightCode("BAW7"), { carrierCode: "BAW", flightNumber: "7" });
  assert.deepEqual(parseFlightCode("UAE163"), { carrierCode: "UAE", flightNumber: "163" });
  assert.deepEqual(parseFlightCode(""), { carrierCode: "", flightNumber: "" });
});

// ── normalizeScrapeApiFlight tests ──────────────────────────────────

test("normalizeScrapeApiFlight produces app-ready row from FR24 internal API item", () => {
  const item = {
    flight: {
      identification: { number: { default: "EK809" } },
      time: {
        scheduled: { departure: 1774173600, arrival: 1774188000 },
        real: { departure: null, arrival: null },
        estimated: { departure: null, arrival: null }
      },
      status: {
        generic: {
          status: { text: "scheduled", color: "gray" },
          eventTime: { utc: null, local: null }
        }
      },
      aircraft: { model: { code: "77W" }, registration: "A6-EGP" },
      airline: {
        name: "Emirates",
        code: { iata: "EK", icao: "UAE" }
      },
      airport: {
        origin: { timezone: { name: "Asia/Dubai", offset: 14400 } },
        destination: {
          code: { iata: "MED", icao: "OEMA" },
          position: { region: { city: "Medina" } }
        }
      }
    }
  };

  const row = normalizeScrapeApiFlight(item, "DXB");
  assert.ok(row);

  // Core fields
  assert.equal(row.originAirport, "DXB");
  assert.equal(row.flight, "EK809");
  assert.equal(row.carrierCode, "EK");
  assert.equal(row.flightNumber, "809");
  assert.equal(row.destinationIata, "MED");
  assert.equal(row.destinationCity, "Medina");
  assert.equal(row.airline, "Emirates");
  assert.equal(row.aircraft, "77W (A6-EGP)");
  assert.equal(row.status, "Scheduled");
  // 1774173600 = 2026-03-22 14:00:00 in Asia/Dubai (UTC+4)
  assert.equal(row.flightDate, "2026-03-22");
  assert.equal(row.timeLocal, "2:00 PM");
  assert.equal(row.departureLocalIso, "2026-03-22T14:00:00");

  // Bonus fields
  assert.equal(row.statusRaw, "scheduled");
  assert.equal(row.scheduledDeparture, 1774173600);
  assert.equal(row.estimatedDeparture, null);
  assert.equal(row.estimatedDepartureLocalIso, null);
  assert.equal(row.timezone, "Asia/Dubai");
});

test("normalizeScrapeApiFlight uses airline.code.iata directly, falls back to flight code", () => {
  // With airline.code.iata present
  const withIata = normalizeScrapeApiFlight({
    flight: {
      identification: { number: { default: "EK809" } },
      time: { scheduled: { departure: 1774173600 }, estimated: {}, real: {} },
      status: { generic: { status: { text: "scheduled" }, eventTime: {} } },
      aircraft: { model: { code: "77W" }, registration: "" },
      airline: { name: "Emirates", code: { iata: "EK" } },
      airport: {
        origin: { timezone: { name: "Asia/Dubai" } },
        destination: { code: { iata: "LHR" }, position: { region: { city: "London" } } }
      }
    }
  }, "DXB");
  assert.equal(withIata.carrierCode, "EK");

  // Without airline.code.iata — should fallback to parsing flight code
  const withoutIata = normalizeScrapeApiFlight({
    flight: {
      identification: { number: { default: "FZ1839" } },
      time: { scheduled: { departure: 1774173600 }, estimated: {}, real: {} },
      status: { generic: { status: { text: "scheduled" }, eventTime: {} } },
      aircraft: { model: { code: "738" }, registration: "" },
      airline: { name: "flydubai", code: {} },
      airport: {
        origin: { timezone: { name: "Asia/Dubai" } },
        destination: { code: { iata: "WAW" }, position: { region: { city: "Warsaw" } } }
      }
    }
  }, "DXB");
  assert.equal(withoutIata.carrierCode, "FZ");
});

test("normalizeScrapeApiFlight returns null for missing destination IATA", () => {
  const row = normalizeScrapeApiFlight({
    flight: {
      identification: { number: { default: "EK209" } },
      time: { scheduled: { departure: 1774173600 }, estimated: {}, real: {} },
      status: { generic: { status: { text: "scheduled" }, eventTime: {} } },
      aircraft: { model: { code: "77W" }, registration: "" },
      airline: { name: "Emirates", code: { iata: "EK" } },
      airport: {
        origin: { timezone: { name: "Asia/Dubai" } },
        destination: { code: {}, position: { region: { city: "" } } }
      }
    }
  }, "DXB");
  assert.equal(row, null);
});

test("normalizeScrapeApiFlight returns null for missing scheduled departure", () => {
  const row = normalizeScrapeApiFlight({
    flight: {
      identification: { number: { default: "EK209" } },
      time: { scheduled: {}, estimated: {}, real: {} },
      status: { generic: { status: { text: "scheduled" }, eventTime: {} } },
      aircraft: { model: { code: "77W" }, registration: "" },
      airline: { name: "Emirates", code: { iata: "EK" } },
      airport: {
        origin: { timezone: { name: "Asia/Dubai" } },
        destination: { code: { iata: "LHR" }, position: { region: { city: "London" } } }
      }
    }
  }, "DXB");
  assert.equal(row, null);
});

test("normalizeScrapeApiFlight preserves estimated departure timing", () => {
  const estTime = 1774177200; // ~1 hour after scheduled
  const row = normalizeScrapeApiFlight({
    flight: {
      identification: { number: { default: "EK209" } },
      time: {
        scheduled: { departure: 1774173600 },
        estimated: { departure: estTime },
        real: {}
      },
      status: {
        generic: {
          status: { text: "estimated" },
          eventTime: { utc: estTime }
        }
      },
      aircraft: { model: { code: "77W" }, registration: "" },
      airline: { name: "Emirates", code: { iata: "EK" } },
      airport: {
        origin: { timezone: { name: "Asia/Dubai" } },
        destination: { code: { iata: "LHR" }, position: { region: { city: "London" } } }
      }
    }
  }, "DXB");

  assert.ok(row);
  assert.equal(row.status, "Estimated");
  assert.equal(row.statusRaw, "estimated");
  assert.equal(row.scheduledDeparture, 1774173600);
  assert.equal(row.estimatedDeparture, estTime);
  assert.ok(row.estimatedDepartureLocalIso);
  assert.match(row.estimatedDepartureLocalIso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
});

test("normalizeScrapeApiFlight normalizes status correctly", () => {
  const makeItem = (statusText) => ({
    flight: {
      identification: { number: { default: "EK1" } },
      time: { scheduled: { departure: 1774173600 }, estimated: {}, real: {} },
      status: { generic: { status: { text: statusText }, eventTime: {} } },
      aircraft: { model: { code: "77W" }, registration: "" },
      airline: { name: "Emirates", code: { iata: "EK" } },
      airport: {
        origin: { timezone: { name: "Asia/Dubai" } },
        destination: { code: { iata: "LHR" }, position: { region: { city: "London" } } }
      }
    }
  });

  assert.equal(normalizeScrapeApiFlight(makeItem("scheduled"), "DXB").status, "Scheduled");
  assert.equal(normalizeScrapeApiFlight(makeItem("estimated"), "DXB").status, "Estimated");
  assert.equal(normalizeScrapeApiFlight(makeItem("delayed"), "DXB").status, "Estimated");
  assert.equal(normalizeScrapeApiFlight(makeItem("canceled"), "DXB").status, "Canceled");

  // Verify statusRaw is preserved for debugging even when normalized
  const delayedRow = normalizeScrapeApiFlight(makeItem("delayed"), "DXB");
  assert.equal(delayedRow.statusRaw, "delayed");
  assert.equal(delayedRow.status, "Estimated");
});

// ── loadFr24Data scrape integration tests ───────────────────────────

// Helper: build a fake FR24 internal API response with N flights across given dates
function buildFakeScrapePage(airportCode, flights, pageNum, totalPages) {
  return {
    result: {
      response: {
        airport: {
          pluginData: {
            schedule: {
              departures: {
                data: flights,
                page: { current: pageNum, total: totalPages }
              }
            }
          }
        }
      }
    }
  };
}

function makeScrapeItem(flightCode, destIata, destCity, unixDep, statusText, airportTz) {
  return {
    flight: {
      identification: { number: { default: flightCode } },
      time: {
        scheduled: { departure: unixDep },
        estimated: { departure: null },
        real: { departure: null }
      },
      status: {
        generic: {
          status: { text: statusText, color: "gray" },
          eventTime: { utc: null, local: null }
        }
      },
      aircraft: { model: { code: "77W" }, registration: "" },
      airline: { name: "Emirates", code: { iata: "EK", icao: "UAE" } },
      airport: {
        origin: { timezone: { name: airportTz, offset: 14400 } },
        destination: {
          code: { iata: destIata, icao: "" },
          position: { region: { city: destCity } }
        }
      }
    }
  };
}

test("loadFr24Data scrape branch returns rows with source=fr24-scrape", async (t) => {
  // Flights on 2026-03-22 (unix 1774173600 = 2026-03-22T14:00:00 Dubai)
  const items = [
    makeScrapeItem("EK1", "LHR", "London", 1774173600, "scheduled", "Asia/Dubai"),
    makeScrapeItem("EK2", "CDG", "Paris", 1774177200, "estimated", "Asia/Dubai"),
    makeScrapeItem("EK3", "JFK", "New York", 1774180800, "delayed", "Asia/Dubai"),
  ];

  const fakeResponse = buildFakeScrapePage("DXB", items, 1, 1);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => fakeResponse,
    status: 200
  });

  const config = {
    fr24ScrapeEnabled: true,
    fr24ScrapeFallbackToFile: false,
    fr24ScrapePageDelayMs: 0,
    fr24ApiTimeoutMs: 5000,
    originAirports: ["DXB"],
  };

  const result = await loadFr24Data(config, { allowedDates: [] });

  assert.equal(result.meta.source, "fr24-scrape");
  assert.equal(result.rows.length, 3);
  assert.equal(result.meta.perAirport.DXB, 3);
  assert.equal(result.meta.validation.valid, true);

  // All three rows have the correct core fields
  for (const row of result.rows) {
    assert.equal(row.originAirport, "DXB");
    assert.equal(row.flightDate, "2026-03-22");
    assert.ok(row.flight);
    assert.ok(row.carrierCode);
    assert.ok(row.destinationIata);
    assert.ok(row.departureLocalIso);
  }

  // Delayed row is normalized to Estimated
  const delayedRow = result.rows.find((r) => r.flight === "EK3");
  assert.equal(delayedRow.status, "Estimated");
  assert.equal(delayedRow.statusRaw, "delayed");
});

test("loadFr24Data scrape rows are correctly filtered by allowedDates downstream", async (t) => {
  // Build items on two different dates:
  // 1774173600 = 2026-03-22T14:00 Dubai
  // 1774260000 = 2026-03-23T14:00 Dubai
  const items = [
    makeScrapeItem("EK1", "LHR", "London", 1774173600, "scheduled", "Asia/Dubai"),
    makeScrapeItem("EK2", "CDG", "Paris", 1774177200, "estimated", "Asia/Dubai"),
    makeScrapeItem("EK3", "JFK", "New York", 1774260000, "scheduled", "Asia/Dubai"),
    makeScrapeItem("EK4", "SIN", "Singapore", 1774263600, "delayed", "Asia/Dubai"),
  ];

  const fakeResponse = buildFakeScrapePage("DXB", items, 1, 1);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => fakeResponse,
    status: 200
  });

  const config = {
    fr24ScrapeEnabled: true,
    fr24ScrapeFallbackToFile: false,
    fr24ScrapePageDelayMs: 0,
    fr24ApiTimeoutMs: 5000,
    originAirports: ["DXB"],
  };

  // Load all rows (scrape returns superset)
  const result = await loadFr24Data(config, { allowedDates: [] });
  assert.equal(result.rows.length, 4, "scrape should return all 4 flights");

  // Downstream filterFr24Rows narrows to one date
  // EK1, EK2 are on 2026-03-22; EK3, EK4 are on 2026-03-23
  const filtered = filterFr24Rows(result.rows, {
    allowedStatuses: ["Scheduled", "Estimated"],
    allowedDates: ["2026-03-22"]
  });
  assert.equal(filtered.length, 2, "only EK1+EK2 on 2026-03-22 should remain");
  assert.ok(filtered.every((r) => r.flightDate === "2026-03-22"));

  // The delayed EK4 on 2026-03-23 is normalized to Estimated but filtered by date
  const ek4 = result.rows.find((r) => r.flight === "EK4");
  assert.equal(ek4.status, "Estimated");
  assert.equal(ek4.flightDate, "2026-03-23");
  assert.ok(!filtered.some((r) => r.flight === "EK4"), "EK4 should not appear in date-filtered set");

  // Narrowing to the second date returns both EK3 (scheduled) and EK4 (delayed→Estimated)
  const filtered2 = filterFr24Rows(result.rows, {
    allowedStatuses: ["Scheduled", "Estimated"],
    allowedDates: ["2026-03-23"]
  });
  assert.equal(filtered2.length, 2, "EK3 + EK4 on 2026-03-23");
  assert.ok(filtered2.some((r) => r.flight === "EK3"), "EK3 (scheduled) on 2026-03-23");
  assert.ok(filtered2.some((r) => r.flight === "EK4"), "EK4 (delayed→Estimated) on 2026-03-23");
});

test("loadFr24Data scrape branch falls back to file on fetch failure", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () => { throw new Error("Network timeout"); };

  // Create a temp FR24 text file for fallback
  const fixture = [
    "Thursday, Mar 05",
    "11:20 AM\tEK209",
    "Athens (ATH)",
    "Emirates\tBoeing 777",
    "Scheduled"
  ].join("\n");
  const tmpFile = path.join(os.tmpdir(), `fr24-fallback-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, fixture, "utf-8");
  t.after(() => { try { fs.unlinkSync(tmpFile); } catch {} });

  const config = {
    fr24ScrapeEnabled: true,
    fr24ScrapeFallbackToFile: true,
    fr24ScrapePageDelayMs: 0,
    fr24ApiTimeoutMs: 1000,
    originAirports: ["DXB"],
    fr24InputFile: tmpFile,
    dashboardTimezone: "Asia/Dubai"
  };

  const result = await loadFr24Data(config, { allowedDates: [] });
  assert.equal(result.meta.source, "file");
  assert.ok(result.meta.fallbackReason.includes("Network timeout"));
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].flight, "EK209");
});
