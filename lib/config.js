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
    fr24ApiEnabled: parseBool(env.FR24_API_ENABLED, false),
    fr24ApiKey: env.FR24_API_KEY || env.FLIGHT_RADAR_API_KEY || env.FLIGHTRADAR24_API_KEY || "",
    fr24ApiUrlTemplate: env.FR24_API_URL_TEMPLATE || "",
    fr24ApiAuthHeader: env.FR24_API_AUTH_HEADER || "x-apikey",
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
    airlinesFile,
    dashboardIntervalMinutes: parseIntStrict(env.DASHBOARD_INTERVAL_MINUTES, 30),
    dashboardLookaheadDays: parseIntStrict(env.DASHBOARD_LOOKAHEAD_DAYS, 2),
    dashboardRunDelayMs: parseIntStrict(env.DASHBOARD_RUN_DELAY_MS, 1200),
    dashboardTimezone: env.DASHBOARD_TIMEZONE || "Asia/Dubai",
    dashboardAutoStart: parseBool(env.DASHBOARD_AUTO_START, false),
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
    if (!config.fr24ApiUrlTemplate) missing.push("FR24_API_URL_TEMPLATE");
  }
  if (!config.fr24ApiEnabled || config.fr24ApiFallbackToFile) {
    if (!fs.existsSync(config.fr24InputFile)) missing.push(`FR24_INPUT_FILE (resolved: ${config.fr24InputFile})`);
  }

  if (config.storageBackend === "supabase") {
    if (!config.supabaseUrl) missing.push("SUPABASE_URL");
    if (!config.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
  }
}
