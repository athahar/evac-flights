import fs from "node:fs";
import path from "node:path";

function parseBool(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseIntStrict(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseFloatStrict(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readListFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim().toUpperCase())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function resolveExistingPath(cwd, preferredPath, fallbackPaths = []) {
  const candidates = [];
  if (preferredPath) candidates.push(preferredPath);
  candidates.push(...fallbackPaths);

  for (const candidate of candidates) {
    const resolved = path.resolve(cwd, candidate);
    if (fs.existsSync(resolved)) return resolved;
  }

  return preferredPath ? path.resolve(cwd, preferredPath) : path.resolve(cwd, fallbackPaths[0] || ".");
}

function parseInputFilesByOrigin(cwd, value) {
  const out = {};
  const raw = String(value || "").trim();
  // Strip leading '=' that can creep in from env-var copy-paste
  const text = raw.startsWith("=") ? raw.slice(1) : raw;
  if (!text) return out;

  const skipped = [];
  for (const token of text.split(",")) {
    const pair = String(token).trim();
    if (!pair) continue;
    const eqIndex = pair.indexOf("=");
    if (eqIndex <= 0) {
      skipped.push(pair);
      continue;
    }
    const origin = pair.slice(0, eqIndex).trim().toUpperCase();
    const filePath = pair.slice(eqIndex + 1).trim();
    if (!origin || !filePath) {
      skipped.push(pair);
      continue;
    }
    out[origin] = path.resolve(cwd, filePath);
  }

  if (skipped.length > 0) {
    console.warn(`[config] FR24_INPUT_FILES_BY_ORIGIN: skipped malformed tokens: ${skipped.join(", ")}`);
  }

  return out;
}

export function loadConfig(env) {
  const cwd = process.cwd();
  const destinationsFile = path.resolve(cwd, env.DESTINATIONS_FILE || "./config/destinations.txt");
  const blocklistFile = path.resolve(cwd, env.BLOCKLIST_FILE || "./config/blocked_middle_east.json");
  const fr24InputFile = resolveExistingPath(cwd, env.FR24_INPUT_FILE, [
    "./data/input/fr24-march-05",
    "./data/fr24-march-05"
  ]);
  const airlinesFile = resolveExistingPath(cwd, env.AIRLINES_FILE || env.AIRLINE_WEBSITES_FILE, [
    "./data/input/airlines.json",
    "./data/airlines.json",
    "./data/input/airline-websites.json"
  ]);
  const fr24InputFilesByOrigin = parseInputFilesByOrigin(cwd, env.FR24_INPUT_FILES_BY_ORIGIN);

  const destinations = readListFile(destinationsFile);
  const blocklist = JSON.parse(fs.readFileSync(blocklistFile, "utf-8"));

  return {
    port: parseIntStrict(env.PORT, 3210),
    autoStart: parseBool(env.AUTO_START, false),
    scanIntervalMinutes: parseIntStrict(env.SCAN_INTERVAL_MINUTES, 2),
    duffelToken: env.DUFFEL_TOKEN || "",
    duffelBaseUrl: env.DUFFEL_BASE_URL || "https://api.duffel.com",
    duffelVersion: env.DUFFEL_VERSION || "v2",
    duffelRateLimitPerMinute: parseIntStrict(env.DUFFEL_RATE_LIMIT_PER_MINUTE, 50),
    duffelRateWindowMs: parseIntStrict(env.DUFFEL_RATE_WINDOW_MS, 60000),
    resendApiKey: env.RESEND_API_KEY || "",
    alertEmailFrom: env.ALERT_EMAIL_FROM || "",
    alertEmailTo: env.ALERT_EMAIL_TO || "",
    originAirports: (env.ORIGIN_AIRPORTS || "DXB")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    destinations,
    blocklist,
    paxAdults: parseIntStrict(env.PAX_ADULTS, 1),
    maxConnections: parseIntStrict(env.MAX_CONNECTIONS, 1),
    defaultCabinClass: env.DEFAULT_CABIN_CLASS || "economy",
    lookaheadDays: parseIntStrict(env.LOOKAHEAD_DAYS, 1),
    fr24InputFile,
    fr24InputFilesByOrigin,
    fr24ApiEnabled: parseBool(env.FR24_API_ENABLED, false),
    fr24ApiKey: env.FR24_API_KEY || env.FLIGHT_RADAR_API_KEY || env.FLIGHTRADAR24_API_KEY || "",
    fr24ApiUrlTemplate: env.FR24_API_URL_TEMPLATE || "",
    fr24ApiUseDefaultTemplate: parseBool(env.FR24_API_USE_DEFAULT_TEMPLATE, true),
    fr24ApiAuthHeader: env.FR24_API_AUTH_HEADER || "Authorization",
    fr24ApiAuthPrefix: env.FR24_API_AUTH_PREFIX || "Bearer",
    fr24ApiAcceptVersion: env.FR24_API_ACCEPT_VERSION || "v1",
    fr24ApiResponsePath: env.FR24_API_RESPONSE_PATH || "data",
    fr24ApiTimeoutMs: parseIntStrict(env.FR24_API_TIMEOUT_MS, 15000),
    fr24ApiMaxAttempts: parseIntStrict(env.FR24_API_MAX_ATTEMPTS, 3),
    fr24ApiBackoffMs: parseIntStrict(env.FR24_API_BACKOFF_MS, 1200),
    fr24ApiRateLimitPerMinute: parseIntStrict(env.FR24_API_RATE_LIMIT_PER_MINUTE, 10),
    fr24ApiInterRequestDelayMs: parseIntStrict(env.FR24_API_INTER_REQUEST_DELAY_MS, 0),
    fr24ApiMinStatusCoverage: parseFloatStrict(env.FR24_API_MIN_STATUS_COVERAGE, 0.8),
    fr24ApiMinFlightCoverage: parseFloatStrict(env.FR24_API_MIN_FLIGHT_COVERAGE, 0.7),
    fr24ApiMinDestinationCoverage: parseFloatStrict(env.FR24_API_MIN_DESTINATION_COVERAGE, 0.95),
    fr24ApiMinDepartureCoverage: parseFloatStrict(env.FR24_API_MIN_DEPARTURE_COVERAGE, 0.95),
    fr24ApiFallbackToFile: parseBool(env.FR24_API_FALLBACK_TO_FILE, true),
    fr24ApiMonthlyCreditBudget: parseIntStrict(env.FR24_API_MONTHLY_CREDIT_BUDGET, 30000),
    fr24ApiCreditWarnPercent: parseFloatStrict(env.FR24_API_CREDIT_WARN_PERCENT, 80),
    airlinesFile,
    dashboardIntervalMinutes: parseIntStrict(env.DASHBOARD_INTERVAL_MINUTES, 30),
    dashboardLookaheadDays: parseIntStrict(env.DASHBOARD_LOOKAHEAD_DAYS, 2),
    dashboardRunDelayMs: parseIntStrict(env.DASHBOARD_RUN_DELAY_MS, 1200),
    dashboardTimezone: env.DASHBOARD_TIMEZONE || "Asia/Dubai",
    dashboardAutoStart: parseBool(env.DASHBOARD_AUTO_START, false),
    dashboardLogSkipDetails: parseBool(env.DASHBOARD_LOG_SKIP_DETAILS, false),
    dashboardExcludeTestAirline: parseBool(env.DASHBOARD_EXCLUDE_TEST_AIRLINE, true),
    duffelLogs: parseBool(env.DUFFEL_LOGS, true),
    duffelLogPayloads: parseBool(env.DUFFEL_LOG_PAYLOADS, false),
    dbPath: path.resolve(cwd, env.DB_PATH || "./data/output/state.db"),
    storageBackend: env.STORAGE_BACKEND || "sqlite",
    supabaseUrl: env.SUPABASE_URL || "",
    posthogKey: env.POSTHOG_KEY || "",
    posthogHost: env.POSTHOG_HOST || "https://us.i.posthog.com",
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || ""
  };
}

export function assertRequiredConfig(config) {
  const missing = [];
  if (!config.duffelToken) missing.push("DUFFEL_TOKEN");
  if (config.originAirports.length === 0) missing.push("ORIGIN_AIRPORTS");
  if (config.fr24ApiEnabled) {
    if (!config.fr24ApiKey) missing.push("FR24_API_KEY");
    if (!config.fr24ApiUrlTemplate && !config.fr24ApiUseDefaultTemplate) {
      missing.push("FR24_API_URL_TEMPLATE");
    }
  }
  if (!config.fr24ApiEnabled || config.fr24ApiFallbackToFile) {
    const byOriginEntries = Object.entries(config.fr24InputFilesByOrigin || {});
    if (byOriginEntries.length > 0) {
      for (const [origin, filePath] of byOriginEntries) {
        if (!fs.existsSync(filePath)) {
          missing.push(`FR24_INPUT_FILES_BY_ORIGIN missing ${origin} file (resolved: ${filePath})`);
        }
      }
      // Warn when configured origins have no matching file entry
      const fileOrigins = new Set(byOriginEntries.map(([o]) => o.toUpperCase()));
      for (const origin of config.originAirports) {
        if (!fileOrigins.has(origin)) {
          console.warn(`[config] ORIGIN_AIRPORTS contains "${origin}" but FR24_INPUT_FILES_BY_ORIGIN has no entry for it (configured: ${byOriginEntries.map(([o]) => o).join(",")})`);
        }
      }
    } else if (!fs.existsSync(config.fr24InputFile)) {
      missing.push(`FR24_INPUT_FILE (resolved: ${config.fr24InputFile})`);
    }
  }

  if (config.storageBackend === "supabase") {
    if (!config.supabaseUrl) missing.push("SUPABASE_URL");
    if (!config.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
  }
}
