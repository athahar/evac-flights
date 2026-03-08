import path from "node:path";
import dotenv from "dotenv";
import express from "express";
import { assertRequiredConfig, loadConfig } from "./lib/config.js";
import { createDb, getSetting, listRuns, listSeen } from "./lib/db.js";
import { scanOnce } from "./lib/scan.js";
import { createDashboardRunner } from "./lib/dashboard-runner.js";
import { loadAirlineDirectory } from "./lib/airlineLinks.js";
import { createStorage } from "./lib/storage/index.js";
import { checkFr24ApiHealth } from "./lib/fr24.js";
import { sendFeedbackEmail } from "./lib/email.js";
import { createSearchAvailabilityService, loadSearchAirports, SearchAvailabilityError } from "./lib/search-availability.js";
import { createPersonalSearchService } from "./lib/personal-search.js";

dotenv.config();

const config = loadConfig(process.env);
assertRequiredConfig(config);
loadAirlineDirectory(config.airlinesFile);

const db = createDb(config.dbPath);
const storage = await createStorage(config, db);
const searchAirportsByIata = config.searchEnabled
  ? loadSearchAirports(config.searchAirportsFile).byIata
  : new Map();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.resolve(process.cwd(), "./public")));

let scanInFlight = false;
let scheduler = null;

const dashboardRunner = createDashboardRunner({ storage, config });
await dashboardRunner.init();
const searchAvailabilityService = createSearchAvailabilityService({
  config,
  storage,
  airportsByIata: searchAirportsByIata
});

// Personal search service — uses staging Supabase for saving, no rate limits
let personalSearchService = null;
if (config.supabaseUrl && config.supabaseServiceRoleKey) {
  const { getSupabaseClient } = await import("./lib/supabase-client.js");
  const supabase = getSupabaseClient(config);
  personalSearchService = createPersonalSearchService({ config, supabase });
}

const sseClients = new Set();
const searchCooldownByIp = new Map();
const liveSearchStartedAtMs = [];

function ts() {
  return new Date().toISOString();
}

function logInfo(message, extra = null) {
  if (extra) {
    console.log(`[${ts()}] ${message}`, extra);
    return;
  }
  console.log(`[${ts()}] ${message}`);
}

function logError(message, err = null) {
  if (err) {
    console.error(`[${ts()}] ${message}`, err);
    return;
  }
  console.error(`[${ts()}] ${message}`);
}

function broadcastSse(eventName, payload) {
  const body = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    client.write(body);
  }
}

dashboardRunner.events.on("run_started", (payload) => {
  const run = payload?.currentRun;
  logInfo(
    `[dashboard] run started id=${run?.id ?? "-"} reason=${run?.reason ?? "-"} origin=${run?.origin ?? "-"} tasks=${run?.totalTasks ?? 0}`
  );
  broadcastSse("run_started", payload);
});

dashboardRunner.events.on("task_progress", (payload) => {
  const base = `[dashboard] run ${payload?.runId ?? "-"} progress ${payload?.completedTasks ?? 0}/${payload?.totalTasks ?? 0} ${payload?.destinationIata ?? "-"} ${payload?.flightDate ?? "-"}`;
  if (payload?.error) {
    logError(`${base} error="${payload.error}"`);
  } else {
    logInfo(base);
  }
  broadcastSse("task_progress", payload);
});

dashboardRunner.events.on("fr24_source_selected", (payload) => {
  logInfo(
    `[dashboard] fr24 source selected source=${payload?.source ?? "unknown"} rows=${payload?.rowCount ?? 0} latencyMs=${payload?.latencyMs ?? 0}${payload?.fallbackReason ? ` fallback=${payload.fallbackReason}` : ""}`
  );
  broadcastSse("fr24_source_selected", payload);
});

dashboardRunner.events.on("run_completed", (payload) => {
  const rowCount = payload?.mostRecent?.rows?.length ?? 0;
  logInfo(
    `[dashboard] run completed id=${payload?.runId ?? "-"} rows=${rowCount} completedAt=${payload?.completedAt ?? "-"} nextRunAt=${payload?.nextRunAt ?? "-"}`
  );
  broadcastSse("run_completed", payload);
});

dashboardRunner.events.on("run_failed", (payload) => {
  logError(
    `[dashboard] run failed id=${payload?.runId ?? "-"} error="${payload?.error ?? "unknown"}" nextRunAt=${payload?.nextRunAt ?? "-"}`
  );
  broadcastSse("run_failed", payload);
});

dashboardRunner.events.on("scheduler_tick", (payload) => {
  logInfo(`[dashboard] scheduler tick nextRunAt=${payload?.nextRunAt ?? "-"}`);
  broadcastSse("scheduler_tick", payload);
});

dashboardRunner.events.on("scheduler_stopped", (payload) => {
  logInfo("[dashboard] scheduler stopped");
  broadcastSse("scheduler_stopped", payload);
});

async function runScan(options = {}) {
  if (scanInFlight) {
    return { status: "skipped", reason: "scan_in_progress" };
  }

  scanInFlight = true;
  try {
    const result = await scanOnce({ db, config, options });
    return { status: "ok", result };
  } finally {
    scanInFlight = false;
  }
}

function schedulerRunning() {
  return Boolean(scheduler);
}

function startScheduler() {
  if (scheduler) return;
  const ms = config.scanIntervalMinutes * 60 * 1000;

  scheduler = setInterval(() => {
    runScan().catch((err) => {
      console.error(`[scan] ${err.message}`);
    });
  }, ms);

  runScan().catch((err) => {
    console.error(`[scan] ${err.message}`);
  });
}

function stopScheduler() {
  if (!scheduler) return;
  clearInterval(scheduler);
  scheduler = null;
}

function feedbackEnabled() {
  return Boolean(config.resendApiKey && config.alertEmailFrom && config.alertEmailTo);
}

function getRequestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  if (forwarded) return forwarded;
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function pruneLiveSearchBudget(nowMs) {
  const cutoff = nowMs - (60 * 60 * 1000);
  while (liveSearchStartedAtMs.length > 0 && liveSearchStartedAtMs[0] < cutoff) {
    liveSearchStartedAtMs.shift();
  }
}

function enforceLiveSearchLimits(req) {
  const nowMs = Date.now();
  const ip = getRequestIp(req);
  const cooldownMs = Math.max(1, config.searchCooldownSeconds) * 1000;
  const lastAtMs = searchCooldownByIp.get(ip) || 0;
  const elapsedMs = nowMs - lastAtMs;

  if (elapsedMs < cooldownMs) {
    const retryAfterSeconds = Math.max(1, Math.ceil((cooldownMs - elapsedMs) / 1000));
    throw new SearchAvailabilityError(
      `Search cooldown active. Retry in ${retryAfterSeconds}s`,
      429,
      retryAfterSeconds
    );
  }

  pruneLiveSearchBudget(nowMs);
  if (liveSearchStartedAtMs.length >= Math.max(1, config.searchGlobalMaxLivePerHour)) {
    const oldestMs = liveSearchStartedAtMs[0] || nowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil(((oldestMs + 60 * 60 * 1000) - nowMs) / 1000));
    throw new SearchAvailabilityError(
      "Global live search budget reached. Please try again shortly.",
      429,
      retryAfterSeconds
    );
  }

  searchCooldownByIp.set(ip, nowMs);
  liveSearchStartedAtMs.push(nowMs);
}

app.get("/health", async (_req, res) => {
  try {
    const dashState = await dashboardRunner.getState();
    res.json({
      ok: true,
      inFlight: scanInFlight,
      scheduler: schedulerRunning(),
      lastRunAt: getSetting(db, "last_run_at"),
      storageBackend: config.storageBackend,
      dashboard: {
        schedulerRunning: dashState.schedulerRunning,
        nextRunAt: dashState.nextRunAt,
        hasCurrentRun: Boolean(dashState.currentRun),
        hasMostRecent: Boolean(dashState.mostRecent)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/fr24/health", async (_req, res) => {
  const result = await checkFr24ApiHealth(config);
  if (!result.ok) {
    logError(`[fr24] health failed status=${result.status} latencyMs=${result.latencyMs} error="${result.error}"`);
    res.status(503).json(result);
    return;
  }
  logInfo(`[fr24] health ok status=${result.status} latencyMs=${result.latencyMs}`);
  res.json(result);
});

app.post("/scan", async (req, res) => {
  try {
    const body = req.body || {};
    const options = {
      departureDate: body.departureDate,
      maxConnections: Number.isInteger(body.maxConnections) ? body.maxConnections : undefined,
      origins: Array.isArray(body.origins) ? body.origins.map((s) => String(s).toUpperCase()) : undefined,
      destinations: Array.isArray(body.destinations) ? body.destinations.map((s) => String(s).toUpperCase()) : undefined
    };

    const result = await runScan(options);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/runs", (req, res) => {
  const limit = Number.parseInt(String(req.query.limit || 20), 10);
  res.json({ data: listRuns(db, Number.isNaN(limit) ? 20 : limit) });
});

app.get("/seen", (req, res) => {
  const limit = Number.parseInt(String(req.query.limit || 50), 10);
  res.json({ data: listSeen(db, Number.isNaN(limit) ? 50 : limit) });
});

app.post("/scheduler/start", (_req, res) => {
  startScheduler();
  res.json({ ok: true, scheduler: true, intervalMinutes: config.scanIntervalMinutes });
});

app.post("/scheduler/stop", (_req, res) => {
  stopScheduler();
  res.json({ ok: true, scheduler: false });
});

app.get("/api/dashboard/state", async (_req, res) => {
  try {
    res.json(await dashboardRunner.getState());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/public-config", (_req, res) => {
  res.json({
    posthogKey: config.posthogKey || "",
    posthogHost: config.posthogHost || "https://us.i.posthog.com",
    originAirports: config.originAirports || [],
    dashboardIntervalMinutes: config.dashboardIntervalMinutes,
    feedbackEnabled: feedbackEnabled(),
    searchEnabled: config.searchEnabled,
    searchMaxDestinations: config.searchMaxDestinations,
    searchCooldownSeconds: config.searchCooldownSeconds,
    searchCacheTtlSeconds: config.searchCacheTtlSeconds,
    searchDateRangeDays: config.searchDateRangeDays,
    searchAllowedOrigins: config.searchAllowedOrigins || config.originAirports || []
  });
});

app.post("/api/search/availability", async (req, res) => {
  try {
    if (!config.searchEnabled) {
      res.status(503).json({ ok: false, error: "Search is disabled" });
      return;
    }

    const result = await searchAvailabilityService.searchAvailability(req.body || {}, {
      beforeLiveCall: () => enforceLiveSearchLimits(req)
    });

    logInfo(
      `[search] source=${result.source} origin=${result.origin} date=${result.departureDate} checked=${result.pairsChecked} offers=${result.offersFound} durationMs=${result.durationMs}`
    );
    res.json(result);
  } catch (err) {
    if (err instanceof SearchAvailabilityError) {
      const status = err.status || 400;
      const payload = { ok: false, error: err.message };
      if (status === 429) {
        payload.retryAfterSeconds = err.retryAfterSeconds || 0;
      }
      res.status(status).json(payload);
      return;
    }

    logError("[api] /api/search/availability failed", err);
    res.status(500).json({ ok: false, error: "Search request failed" });
  }
});

app.post("/api/feedback", async (req, res) => {
  try {
    if (!feedbackEnabled()) {
      res.status(503).json({ ok: false, error: "Feedback is not configured" });
      return;
    }

    const body = req.body || {};
    const message = String(body.message || "").trim();
    if (message.length < 4) {
      res.status(400).json({ ok: false, error: "Feedback message is too short" });
      return;
    }
    if (message.length > 2000) {
      res.status(400).json({ ok: false, error: "Feedback message is too long" });
      return;
    }

    const origin = String(body.origin || "").trim().toUpperCase();
    const currency = String(body.currency || "").trim().toUpperCase();
    const page = String(body.page || "").trim().slice(0, 800);
    const userAgent = String(req.get("user-agent") || "").trim().slice(0, 500);
    const submittedAt = new Date().toISOString();

    await sendFeedbackEmail(config, {
      message,
      origin,
      currency,
      page,
      userAgent,
      submittedAt
    });

    logInfo(`[feedback] sent origin=${origin || "-"} chars=${message.length}`);
    res.json({ ok: true });
  } catch (err) {
    logError("[feedback] failed", err);
    res.status(502).json({ ok: false, error: "Failed to send feedback" });
  }
});

app.post("/api/dashboard/run-now", async (req, res) => {
  try {
    const body = req.body || {};
    const explicitOrigins = Array.isArray(body.origins)
      ? body.origins.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean)
      : [];
    const singleOrigin = String(body.origin || "").trim().toUpperCase();
    const origins = explicitOrigins.length > 0
      ? explicitOrigins
      : (singleOrigin ? [singleOrigin] : []);

    logInfo(
      `[api] POST /api/dashboard/run-now${origins.length > 0 ? ` origins=${origins.join(",")}` : ""}`
    );
    const result = await dashboardRunner.runNow("manual", { origins });
    res.json(result);
  } catch (err) {
    logError("[api] /api/dashboard/run-now failed", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/dashboard/scheduler/start", (_req, res) => {
  logInfo(`[api] POST /api/dashboard/scheduler/start intervalMinutes=${config.dashboardIntervalMinutes}`);
  dashboardRunner.startScheduler();
  res.json({ ok: true, intervalMinutes: config.dashboardIntervalMinutes });
});

app.post("/api/dashboard/scheduler/stop", (_req, res) => {
  logInfo("[api] POST /api/dashboard/scheduler/stop");
  dashboardRunner.stopScheduler();
  res.json({ ok: true });
});

app.post("/api/dashboard/clear-runs", async (_req, res) => {
  try {
    const dashState = await dashboardRunner.getState();
    if (dashState.currentRun) {
      res.status(409).json({
        ok: false,
        error: "Cannot clear data while a run is in progress. Wait for completion or stop scheduler first."
      });
      return;
    }

    const deleted = await storage.clearAllData();
    logInfo(
      `[api] POST /api/dashboard/clear-runs deleted rows: dashboard_run_rows=${deleted.dashboardRunRows}, dashboard_runs=${deleted.dashboardRuns}, runs=${deleted.runs}, seen_alerts=${deleted.seenAlerts}`
    );

    broadcastSse("runs_cleared", {
      at: new Date().toISOString(),
      deleted
    });

    res.json({
      ok: true,
      deleted
    });
  } catch (err) {
    logError("[api] /api/dashboard/clear-runs failed", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/dashboard/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  res.write(`event: hello\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);

  sseClients.add(res);
  logInfo(`[sse] client connected active=${sseClients.size}`);

  req.on("close", () => {
    sseClients.delete(res);
    logInfo(`[sse] client disconnected active=${sseClients.size}`);
  });
});

app.get("/", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "./public/index.html"));
});

app.get("/search", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "./public/search.html"));
});

// ── Personal search routes (no rate limiting) ───────────────────────

app.get("/personal", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "./public/personal.html"));
});

app.post("/api/personal/flights", async (req, res) => {
  try {
    if (!personalSearchService) {
      res.status(503).json({ ok: false, error: "Personal search is not configured" });
      return;
    }
    const body = req.body || {};
    const result = await personalSearchService.searchFlights(body);
    logInfo(`[personal] flights: ${result.offers.length} offers, ${result.pairsSearched} pairs, ${result.durationMs}ms`);
    res.json({ ok: true, ...result });
  } catch (err) {
    logError("[personal] flights failed", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/personal/stays", async (req, res) => {
  try {
    if (!personalSearchService) {
      res.status(503).json({ ok: false, error: "Personal search is not configured" });
      return;
    }
    const body = req.body || {};
    const result = await personalSearchService.searchStaysForLocation(body);
    logInfo(`[personal] stays: ${result.results.length} accommodations in ${result.location}, ${result.durationMs}ms`);
    res.json({ ok: true, ...result });
  } catch (err) {
    logError("[personal] stays failed", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(config.port, () => {
  logInfo(`evac-flight-alert server listening on :${config.port}`);
  logInfo(`[config] storageBackend=${config.storageBackend} dashboard interval=${config.dashboardIntervalMinutes}m lookaheadDays=${config.dashboardLookaheadDays} timezone=${config.dashboardTimezone} origin=${config.originAirports[0]}`);
  if (config.dashboardAutoStart) {
    dashboardRunner.startScheduler();
    logInfo(`[dashboard] scheduler auto-started interval=${config.dashboardIntervalMinutes}m (aligned slots)`);
  } else {
    logInfo("[dashboard] scheduler auto-start disabled (manual mode)");
  }
});
