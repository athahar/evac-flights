import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extractFlightsArray,
  normalizeApiFlight,
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
