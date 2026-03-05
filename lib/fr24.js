import fs from "node:fs";

const MONTHS = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseTime12(timeText) {
  const match = String(timeText || "").trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return null;

  const hour12 = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();

  let hour24 = hour12 % 12;
  if (ampm === "PM") hour24 += 12;

  return { hour24, minute };
}

function parseFlightCode(code) {
  const text = String(code || "").trim().toUpperCase();
  const compact = text.replace(/\s+/g, "");

  // FR24 rows typically use IATA carrier codes (2 chars), e.g. EK163, VS401, FZ1839.
  // Parse 2-char code first to avoid greedy 3-char splits like VS4 + 01.
  const iataMatch = compact.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/);
  if (iataMatch) {
    return {
      carrierCode: iataMatch[1],
      flightNumber: iataMatch[2]
    };
  }

  // Fallback for occasional 3-char ICAO-style prefixes.
  const icaoMatch = compact.match(/^([A-Z]{3})(\d{1,4}[A-Z]?)$/);
  if (icaoMatch) {
    return {
      carrierCode: icaoMatch[1],
      flightNumber: icaoMatch[2]
    };
  }

  return { carrierCode: "", flightNumber: compact || "" };
}

function parseDateHeader(line, referenceYear) {
  const match = String(line || "").trim().match(/^[A-Za-z]+,\s+([A-Za-z]{3})\s+(\d{2})$/);
  if (!match) return "";

  const month = MONTHS[match[1].toUpperCase()];
  const day = Number.parseInt(match[2], 10);
  if (!month || Number.isNaN(day)) return "";

  return `${referenceYear}-${pad2(month)}-${pad2(day)}`;
}

function toIata(destinationLine) {
  const match = String(destinationLine || "").match(/\(([^)]+)\)\s*$/);
  return match ? match[1].trim().toUpperCase() : "";
}

function toCity(destinationLine) {
  return String(destinationLine || "").replace(/\s*\([^)]+\)\s*$/, "").trim();
}

function parseAirlineAndAircraft(line) {
  const parts = String(line || "").split("\t").map((x) => x.trim()).filter(Boolean);
  return {
    airline: parts[0] || "",
    aircraft: parts[1] || ""
  };
}

function getDateIsoInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function getDateRangeIso(timezone, lookaheadDays) {
  const out = [];
  const base = new Date();
  for (let i = 0; i < lookaheadDays; i += 1) {
    const d = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    out.push(getDateIsoInTimezone(d, timezone));
  }
  return out;
}

export function parseFr24File(filePath, options = {}) {
  const referenceYear = Number.isInteger(options.referenceYear)
    ? options.referenceYear
    : new Date().getUTCFullYear();

  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  const rows = [];
  let sectionDateIso = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] || "";

    const maybeDate = parseDateHeader(line, referenceYear);
    if (maybeDate) {
      sectionDateIso = maybeDate;
      continue;
    }

    if (!/^\d{1,2}:\d{2} [AP]M\t/.test(line)) {
      continue;
    }

    const firstParts = line.split("\t");
    const timeLocal = (firstParts[0] || "").trim();
    const flight = (firstParts[1] || "").trim().toUpperCase();

    const destinationLine = (lines[i + 1] || "").trim();
    const airlineAircraftLine = (lines[i + 2] || "").trim();
    const status = (lines[i + 3] || "").trim();

    const { airline, aircraft } = parseAirlineAndAircraft(airlineAircraftLine);
    const destinationIata = toIata(destinationLine);
    const destinationCity = toCity(destinationLine);
    const parsedTime = parseTime12(timeLocal);
    const departureLocalIso = parsedTime && sectionDateIso
      ? `${sectionDateIso}T${pad2(parsedTime.hour24)}:${pad2(parsedTime.minute)}:00`
      : "";

    const { carrierCode, flightNumber } = parseFlightCode(flight);

    rows.push({
      flightDate: sectionDateIso,
      timeLocal,
      departureLocalIso,
      flight,
      carrierCode,
      flightNumber,
      destinationCity,
      destinationIata,
      airline,
      aircraft,
      status
    });
  }

  return rows;
}

export function filterFr24Rows(rows, options) {
  const blockedAirports = new Set((options.blockedAirports || []).map((x) => String(x).toUpperCase()));
  const statuses = new Set((options.allowedStatuses || ["Scheduled", "Estimated"]).map((x) => String(x)));
  const allowedDates = new Set((options.allowedDates || []).map((x) => String(x)));

  return rows.filter((row) => {
    const statusText = String(row.status || "");
    const statusType = statusText.startsWith("Estimated") ? "Estimated" : statusText;
    const statusOk = statuses.has(statusType);
    const airportOk = row.destinationIata && !blockedAirports.has(String(row.destinationIata).toUpperCase());
    const dateOk = allowedDates.size === 0 || allowedDates.has(row.flightDate);
    return statusOk && airportOk && dateOk;
  });
}
