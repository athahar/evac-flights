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

export function parseFlightCode(code) {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPathValue(obj, dottedPath) {
  if (!obj || !dottedPath) return undefined;
  const parts = String(dottedPath)
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);

  let curr = obj;
  for (const part of parts) {
    if (curr === null || curr === undefined) return undefined;
    curr = curr[part];
  }
  return curr;
}

export function extractFlightsArray(payload, responsePath) {
  if (Array.isArray(payload)) return payload;

  const candidates = [];
  if (responsePath) candidates.push(readPathValue(payload, responsePath));
  candidates.push(payload?.data, payload?.departures, payload?.flights, payload?.result, payload?.items);

  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }

  return [];
}

export function normalizeStatus(rawStatus) {
  const text = String(rawStatus || "").trim();
  const lower = text.toLowerCase();
  if (!text) return "";
  if (lower.includes("cancel")) return "Canceled";
  if (lower.includes("estim")) return "Estimated";
  if (lower.includes("sched") || lower.includes("plan")) return "Scheduled";
  return text;
}

function coerceToDate(value) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    // Treat small unix values as seconds.
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const asNumber = Number.parseFloat(String(value));
  if (Number.isFinite(asNumber) && String(value).trim().match(/^\d+(\.\d+)?$/)) {
    const ms = asNumber < 1e12 ? asNumber * 1000 : asNumber;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildLocalDateParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type) => (parts.find((p) => p.type === type) || {}).value || "00";
  const dateIso = `${get("year")}-${get("month")}-${get("day")}`;
  const localIso = `${dateIso}T${get("hour")}:${get("minute")}:${get("second")}`;
  const hour24 = Number.parseInt(get("hour"), 10);
  const minute = get("minute");
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  const timeLocal = `${hour12}:${minute} ${period}`;
  return { dateIso, localIso, timeLocal };
}

function pickValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

export function normalizeApiFlight(item, timezone) {
  const departRaw = pickValue(
    item?.departure?.scheduled,
    item?.departure?.estimated,
    item?.times?.scheduled?.departure,
    item?.times?.estimated?.departure,
    item?.time?.scheduled?.departure,
    item?.time?.estimated?.departure,
    item?.departure_time?.scheduled,
    item?.departure_time?.estimated,
    item?.scheduled_departure,
    item?.estimated_departure,
    item?.datetime_takeoff,
    item?.first_seen
  );

  const departureDate = coerceToDate(departRaw);
  if (!departureDate) return null;

  const local = buildLocalDateParts(departureDate, timezone);
  const flightCode = String(
    pickValue(
      item?.flight?.number?.iata,
      item?.flight?.identification?.number?.default,
      item?.flight?.iata,
      item?.flight_number,
      item?.number,
      item?.flight,
      item?.callsign
    )
  )
    .trim()
    .toUpperCase();
  const { carrierCode, flightNumber } = parseFlightCode(flightCode);

  const destinationIata = String(
    pickValue(
      item?.destination?.iata,
      item?.airport?.destination?.code?.iata,
      item?.route?.destination,
      item?.arrival?.iata,
      item?.dest_iata,
      item?.dest_iata_actual
    )
  )
    .trim()
    .toUpperCase();
  if (!destinationIata) return null;

  const destinationCity = String(
    pickValue(
      item?.destination?.city,
      item?.airport?.destination?.position?.region?.city,
      item?.destination?.name,
      item?.dest_iata,
      item?.dest_iata_actual,
      destinationIata
    )
  ).trim();

  const airline = String(
    pickValue(
      item?.airline?.name,
      item?.flight?.airline?.name,
      item?.airline_name,
      item?.operator?.name,
      item?.operating_as,
      item?.painted_as
    )
  ).trim();

  const status = normalizeStatus(
    pickValue(
      item?.status?.text,
      item?.flight?.status?.text,
      item?.status,
      item?.state,
      "Scheduled"
    )
  );

  return {
    flightDate: local.dateIso,
    timeLocal: local.timeLocal,
    departureLocalIso: local.localIso,
    flight: flightCode,
    carrierCode,
    flightNumber,
    destinationCity,
    destinationIata,
    airline,
    aircraft: String(
      pickValue(
        item?.aircraft?.model?.text,
        item?.aircraft?.model,
        item?.aircraft
      )
    ).trim(),
    status
  };
}

function buildFr24ApiUrl(template, airport, dateIso) {
  const defaultTemplate = "https://fr24api.flightradar24.com/api/flight-summary/light?airports={AIRPORT}&type=outbound&flight_datetime_from={DATE}T00:00:00&flight_datetime_to={DATE}T23:59:59";
  const selectedTemplate = String(template || "").trim() || defaultTemplate;
  return selectedTemplate
    .replaceAll("{AIRPORT}", encodeURIComponent(String(airport || "").toUpperCase()))
    .replaceAll("{DATE}", encodeURIComponent(String(dateIso || "")));
}

function buildAuthHeaderValue(apiKey, prefix) {
  const token = String(apiKey || "").trim();
  if (!token) return "";
  const normalizedPrefix = String(prefix || "").trim();
  if (!normalizedPrefix) return token;

  const lowerToken = token.toLowerCase();
  const lowerPrefix = `${normalizedPrefix.toLowerCase()} `;
  if (lowerToken.startsWith(lowerPrefix)) return token;

  return `${normalizedPrefix} ${token}`;
}

async function fetchJson(url, headers, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(`HTTP ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 300)}` : ""}`);
      err.status = res.status;
      err.retryAfterMs = parseRetryAfterWaitMs(res.headers);
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

const fr24RequestTimestampsMs = [];
let fr24RateLimitQueue = Promise.resolve();
const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;
const FR24_FILE_STALE_MS = 6 * 60 * 60 * 1000;
let fr24DailyCreditState = {
  dayKey: "",
  credits: 0
};

function getDubaiDateKey(now = new Date()) {
  return new Date(now.getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
}

function getDubaiDateMeta(now = new Date()) {
  const shifted = new Date(now.getTime() + DUBAI_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { year, month, daysInMonth };
}

function syncFr24DailyCredits(now = new Date()) {
  const dayKey = getDubaiDateKey(now);
  if (fr24DailyCreditState.dayKey !== dayKey) {
    fr24DailyCreditState = {
      dayKey,
      credits: 0
    };
  }
  return fr24DailyCreditState;
}

function incrementFr24DailyCredits(now = new Date()) {
  const state = syncFr24DailyCredits(now);
  state.credits += 1;
}

export function getFr24CreditUsage(config, now = new Date()) {
  const state = syncFr24DailyCredits(now);
  const { daysInMonth } = getDubaiDateMeta(now);
  const budget = Number.isFinite(config?.fr24ApiMonthlyCreditBudget)
    ? Math.max(0, Math.floor(config.fr24ApiMonthlyCreditBudget))
    : 30000;
  const warnPercent = Number.isFinite(config?.fr24ApiCreditWarnPercent)
    ? Math.max(0, config.fr24ApiCreditWarnPercent)
    : 80;
  const monthEstimate = state.credits * daysInMonth;
  const warnThreshold = budget * (warnPercent / 100);

  return {
    dayKey: state.dayKey,
    today: state.credits,
    monthEstimate,
    budget,
    warnPercent,
    warnThreshold,
    shouldWarn: budget > 0 && monthEstimate >= warnThreshold
  };
}

function warnIfFr24FileStale(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const ageMs = Date.now() - stats.mtime.getTime();
    if (ageMs > FR24_FILE_STALE_MS) {
      const ageHours = (ageMs / (60 * 60 * 1000)).toFixed(1);
      console.warn(`[fr24] file source appears stale ageHours=${ageHours} path=${filePath}`);
    }
  } catch (err) {
    console.warn(`[fr24] could not inspect file freshness path=${filePath}: ${err.message}`);
  }
}

function loadConfiguredFr24FileRows(config) {
  const byOriginEntries = Object.entries(config?.fr24InputFilesByOrigin || {}).filter(([, filePath]) => Boolean(filePath));
  if (byOriginEntries.length === 0) {
    warnIfFr24FileStale(config.fr24InputFile);
    return {
      rows: parseFr24File(config.fr24InputFile),
      filePaths: [config.fr24InputFile]
    };
  }

  const configuredOrigins = new Set(
    (config?.originAirports || [])
      .map((origin) => String(origin || "").trim().toUpperCase())
      .filter(Boolean)
  );
  const scopedEntries = configuredOrigins.size > 0
    ? byOriginEntries.filter(([origin]) => configuredOrigins.has(String(origin || "").trim().toUpperCase()))
    : byOriginEntries;
  const selectedEntries = scopedEntries.length > 0 ? scopedEntries : byOriginEntries;

  const rows = [];
  const filePaths = [];
  for (const [origin, filePath] of selectedEntries) {
    warnIfFr24FileStale(filePath);
    const fileRows = parseFr24File(filePath).map((row) => ({
      ...row,
      originAirport: origin
    }));
    rows.push(...fileRows);
    filePaths.push(filePath);
  }

  return { rows, filePaths };
}

async function waitForFr24RateLimitSlot(config) {
  const limitPerMinute = Number.isInteger(config?.fr24ApiRateLimitPerMinute)
    ? config.fr24ApiRateLimitPerMinute
    : 8;
  const windowMs = 60_000;
  if (limitPerMinute <= 0) return;

  const attemptAcquire = async () => {
    while (true) {
      const now = Date.now();
      while (fr24RequestTimestampsMs.length > 0 && now - fr24RequestTimestampsMs[0] >= windowMs) {
        fr24RequestTimestampsMs.shift();
      }

      if (fr24RequestTimestampsMs.length < limitPerMinute) {
        fr24RequestTimestampsMs.push(now);
        return;
      }

      const nextOpenMs = fr24RequestTimestampsMs[0] + windowMs - now + 25;
      await sleep(Math.max(25, nextOpenMs));
    }
  };

  fr24RateLimitQueue = fr24RateLimitQueue.then(attemptAcquire, attemptAcquire);
  await fr24RateLimitQueue;
}

function parseRetryAfterWaitMs(headers) {
  const retryAfter = headers?.get?.("retry-after");
  if (retryAfter) {
    const asNum = Number.parseFloat(retryAfter);
    if (!Number.isNaN(asNum)) {
      return Math.max(0, Math.ceil(asNum * 1000));
    }

    // RFC allows Retry-After as an HTTP-date.
    const date = new Date(retryAfter);
    if (!Number.isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }
  }
  return 0;
}

function isRetriableStatus(status) {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 504);
}

async function fetchJsonWithRetry(config, url, headers, metrics) {
  const maxAttempts = Number.isInteger(config?.fr24ApiMaxAttempts) ? config.fr24ApiMaxAttempts : 4;
  const baseBackoffMs = Number.isInteger(config?.fr24ApiBackoffMs) ? config.fr24ApiBackoffMs : 1200;
  const timeoutMs = Number.isInteger(config?.fr24ApiTimeoutMs) ? config.fr24ApiTimeoutMs : 15000;

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    metrics.attempts += 1;
    await waitForFr24RateLimitSlot(config);
    metrics.requests += 1;

    try {
      const payload = await fetchJson(url, headers, timeoutMs);
      incrementFr24DailyCredits();
      return payload;
    } catch (err) {
      const message = String(err?.message || "Unknown FR24 API error");
      const status = Number.isInteger(err?.status)
        ? err.status
        : (() => {
            const statusMatch = message.match(/^HTTP\s+(\d{3})\b/i);
            return statusMatch ? Number.parseInt(statusMatch[1], 10) : 0;
          })();
      const retriable = status ? isRetriableStatus(status) : true;
      const isLast = attempt >= maxAttempts;

      if (status === 429) metrics.rateLimited += 1;

      if (!retriable || isLast) {
        metrics.failures += 1;
        throw err;
      }

      metrics.retries += 1;
      const retryAfterMs = Number.isInteger(err?.retryAfterMs) ? err.retryAfterMs : 0;
      const jitterMs = Math.floor(Math.random() * 250);
      const backoffMs = Math.max(retryAfterMs, baseBackoffMs * attempt) + jitterMs;
      await sleep(backoffMs);
    }
  }

  metrics.failures += 1;
  throw new Error("FR24 request failed after retries");
}

function calculateCoverage(rows, predicate) {
  if (!rows.length) return 0;
  const matched = rows.reduce((acc, row) => (predicate(row) ? acc + 1 : acc), 0);
  return matched / rows.length;
}

function validateNormalizedRows(rows, config) {
  if (!rows.length) {
    return {
      valid: true,
      errors: [],
      coverage: {
        statusCoverage: 0,
        flightCoverage: 0,
        destinationCoverage: 0,
        departureCoverage: 0
      }
    };
  }

  const minStatusCoverage = Number.isFinite(config?.fr24ApiMinStatusCoverage) ? config.fr24ApiMinStatusCoverage : 0.8;
  const minFlightCoverage = Number.isFinite(config?.fr24ApiMinFlightCoverage) ? config.fr24ApiMinFlightCoverage : 0.7;
  const minDestinationCoverage = Number.isFinite(config?.fr24ApiMinDestinationCoverage) ? config.fr24ApiMinDestinationCoverage : 0.95;
  const minDepartureCoverage = Number.isFinite(config?.fr24ApiMinDepartureCoverage) ? config.fr24ApiMinDepartureCoverage : 0.95;

  const statusCoverage = calculateCoverage(rows, (row) => {
    const status = String(row.status || "").toLowerCase();
    return status === "scheduled" || status === "estimated" || status === "canceled";
  });
  const flightCoverage = calculateCoverage(rows, (row) => String(row.flight || "").trim().length > 0);
  const destinationCoverage = calculateCoverage(rows, (row) => String(row.destinationIata || "").trim().length === 3);
  const departureCoverage = calculateCoverage(rows, (row) => String(row.departureLocalIso || "").trim().length >= 19);

  const errors = [];
  if (statusCoverage < minStatusCoverage) errors.push(`statusCoverage=${statusCoverage.toFixed(3)} < ${minStatusCoverage}`);
  if (flightCoverage < minFlightCoverage) errors.push(`flightCoverage=${flightCoverage.toFixed(3)} < ${minFlightCoverage}`);
  if (destinationCoverage < minDestinationCoverage) errors.push(`destinationCoverage=${destinationCoverage.toFixed(3)} < ${minDestinationCoverage}`);
  if (departureCoverage < minDepartureCoverage) errors.push(`departureCoverage=${departureCoverage.toFixed(3)} < ${minDepartureCoverage}`);

  return {
    valid: errors.length === 0,
    errors,
    coverage: {
      statusCoverage,
      flightCoverage,
      destinationCoverage,
      departureCoverage
    }
  };
}

async function fetchFr24ApiRows(config, allowedDates) {
  const template = String(config.fr24ApiUrlTemplate || "").trim();
  const apiKey = String(config.fr24ApiKey || "").trim();
  const authHeader = String(config.fr24ApiAuthHeader || "Authorization").trim();
  const authPrefix = String(config.fr24ApiAuthPrefix || "Bearer").trim();
  const acceptVersion = String(config.fr24ApiAcceptVersion || "v1").trim();
  const responsePath = String(config.fr24ApiResponsePath || "data").trim();
  const interRequestDelayMs = Number.isInteger(config?.fr24ApiInterRequestDelayMs) ? config.fr24ApiInterRequestDelayMs : 0;
  const rows = [];
  const metrics = {
    requests: 0,
    attempts: 0,
    retries: 0,
    failures: 0,
    rateLimited: 0,
    emptyResponses: 0
  };
  let rawRowsCount = 0;

  for (const airport of config.originAirports) {
    for (const dateIso of allowedDates) {
      const url = buildFr24ApiUrl(template, airport, dateIso);
      if (!url) continue;

      const headers = {
        Accept: "application/json",
        "Accept-Version": acceptVersion
      };
      if (apiKey) headers[authHeader] = buildAuthHeaderValue(apiKey, authPrefix);

      const payload = await fetchJsonWithRetry(config, url, headers, metrics);
      const flights = extractFlightsArray(payload, responsePath);
      rawRowsCount += flights.length;
      if (flights.length === 0) metrics.emptyResponses += 1;

      for (const item of flights) {
        const normalized = normalizeApiFlight(item, config.dashboardTimezone || "Asia/Dubai");
        if (normalized) {
          rows.push({
            ...normalized,
            originAirport: String(airport || "").toUpperCase()
          });
        }
      }

      if (interRequestDelayMs > 0) {
        // Optional pacing between endpoint calls.
        // eslint-disable-next-line no-await-in-loop
        await sleep(interRequestDelayMs);
      }
    }
  }

  const validation = validateNormalizedRows(rows, config);
  const meta = {
    source: "api",
    rawRowsCount,
    normalizedRowsCount: rows.length,
    metrics,
    validation
  };

  if (!validation.valid) {
    const reasons = validation.errors.join("; ");
    throw new Error(`FR24 normalized data failed validation: ${reasons}`);
  }

  return { rows, meta };
}

export async function loadFr24Data(config, options = {}) {
  const allowedDates = Array.isArray(options.allowedDates) ? options.allowedDates : [];
  let fallbackReason = "";

  if (config?.fr24ApiEnabled) {
    try {
      const apiResult = await fetchFr24ApiRows(config, allowedDates);
      const apiRows = apiResult.rows || [];
      const apiMeta = apiResult.meta || { source: "api" };
      const { metrics = {}, validation = {} } = apiMeta;
      console.log(
        `[fr24] source=api rows=${apiRows.length} raw=${apiMeta.rawRowsCount || 0} requests=${metrics.requests || 0} retries=${metrics.retries || 0} failures=${metrics.failures || 0} statusCoverage=${(validation.coverage?.statusCoverage || 0).toFixed(2)}`
      );
      if (apiRows.length > 0 || !config.fr24ApiFallbackToFile) {
        return {
          rows: apiRows,
          meta: apiMeta
        };
      }
      fallbackReason = "api_empty_rows";
      console.warn("[fr24] API returned no rows, falling back to file source");
      const { rows: fileRows, filePaths } = loadConfiguredFr24FileRows(config);
      return {
        rows: fileRows,
        meta: {
          source: "file",
          fallbackReason,
          filePaths,
          rawRowsCount: fileRows.length,
          normalizedRowsCount: fileRows.length
        }
      };
    } catch (err) {
      console.error(`[fr24] API fetch failed: ${err.message}`);
      if (!config.fr24ApiFallbackToFile) {
        throw err;
      }
      console.warn("[fr24] falling back to file source");
      fallbackReason = err.message;
      const { rows: fileRows, filePaths } = loadConfiguredFr24FileRows(config);
      return {
        rows: fileRows,
        meta: {
          source: "file",
          fallbackReason,
          filePaths,
          rawRowsCount: fileRows.length,
          normalizedRowsCount: fileRows.length
        }
      };
    }
  }

  const { rows: fileRows, filePaths } = loadConfiguredFr24FileRows(config);
  console.log(
    `[fr24] source=file rows=${fileRows.length} files=${filePaths.length}${filePaths.length === 1 ? ` path=${filePaths[0]}` : ""}`
  );
  return {
    rows: fileRows,
    meta: {
      source: "file",
      fallbackReason: fallbackReason || null,
      filePaths,
      rawRowsCount: fileRows.length,
      normalizedRowsCount: fileRows.length
    }
  };
}

export async function loadFr24Rows(config, options = {}) {
  const loaded = await loadFr24Data(config, options);
  return loaded.rows || [];
}

export async function checkFr24ApiHealth(config) {
  const startedAtMs = Date.now();
  const origin = String(config?.originAirports?.[0] || "").trim().toUpperCase();
  const timezone = config?.dashboardTimezone || "Asia/Dubai";
  const dateIso = getDateRangeIso(timezone, 1)[0];
  const authHeader = String(config?.fr24ApiAuthHeader || "Authorization").trim();
  const authPrefix = String(config?.fr24ApiAuthPrefix || "Bearer").trim();
  const acceptVersion = String(config?.fr24ApiAcceptVersion || "v1").trim();
  const apiKey = String(config?.fr24ApiKey || "").trim();

  if (!origin) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAtMs,
      status: 0,
      error: "Missing origin airport"
    };
  }
  if (!apiKey) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAtMs,
      status: 0,
      error: "Missing FR24 API key"
    };
  }

  const url = buildFr24ApiUrl("", origin, dateIso);
  const headers = {
    Accept: "application/json",
    "Accept-Version": acceptVersion
  };
  headers[authHeader] = buildAuthHeaderValue(apiKey, authPrefix);

  const metrics = {
    requests: 0,
    attempts: 0,
    retries: 0,
    failures: 0,
    rateLimited: 0,
    emptyResponses: 0
  };

  try {
    await fetchJsonWithRetry(
      {
        ...config,
        fr24ApiMaxAttempts: 1
      },
      url,
      headers,
      metrics
    );
    return {
      ok: true,
      latencyMs: Date.now() - startedAtMs,
      status: 200,
      error: null
    };
  } catch (err) {
    const status = Number.isInteger(err?.status) ? err.status : 0;
    return {
      ok: false,
      latencyMs: Date.now() - startedAtMs,
      status,
      error: String(err?.message || "Unknown FR24 API error")
    };
  }
}
