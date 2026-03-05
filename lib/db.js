import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function ensureColumn(db, tableName, columnName, columnDefSql) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((col) => col.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefSql}`);
}

export function createDb(dbPath) {
  ensureDir(dbPath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      scanned_pairs INTEGER NOT NULL DEFAULT 0,
      offers_seen INTEGER NOT NULL DEFAULT 0,
      offers_matched INTEGER NOT NULL DEFAULT 0,
      new_alerts INTEGER NOT NULL DEFAULT 0,
      emailed INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS seen_alerts (
      fingerprint TEXT PRIMARY KEY,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dashboard_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      origin TEXT NOT NULL,
      lookahead_days INTEGER NOT NULL,
      total_tasks INTEGER NOT NULL DEFAULT 0,
      completed_tasks INTEGER NOT NULL DEFAULT 0,
      next_run_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS dashboard_run_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      flight_date TEXT NOT NULL,
      departure_time_local TEXT NOT NULL,
      departure_local_iso TEXT NOT NULL,
      airline TEXT NOT NULL,
      carrier_code TEXT,
      marketing_carrier_code TEXT,
      flight_number TEXT,
      origin TEXT NOT NULL,
      destination_city TEXT NOT NULL,
      destination_iata TEXT NOT NULL,
      fr24_status TEXT NOT NULL,
      availability_status TEXT NOT NULL,
      bookability_status TEXT NOT NULL DEFAULT 'PENDING',
      offer_request_id TEXT,
      available_offer_count INTEGER NOT NULL DEFAULT 0,
      matched_offer_count INTEGER NOT NULL DEFAULT 0,
      seats_min INTEGER,
      price_amount TEXT,
      price_currency TEXT,
      offer_airline TEXT,
      top_offers_json TEXT,
      booking_url TEXT,
      website_mode TEXT NOT NULL DEFAULT 'dash',
      booking_needs_verify INTEGER NOT NULL DEFAULT 0,
      observed_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES dashboard_runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_dashboard_run_rows_run_id ON dashboard_run_rows(run_id);
    CREATE INDEX IF NOT EXISTS idx_dashboard_run_rows_sort ON dashboard_run_rows(run_id, availability_status, available_offer_count, departure_local_iso);
  `);

  ensureColumn(db, "dashboard_run_rows", "seats_min", "seats_min INTEGER");
  ensureColumn(db, "dashboard_run_rows", "bookability_status", "bookability_status TEXT NOT NULL DEFAULT 'PENDING'");
  ensureColumn(db, "dashboard_run_rows", "offer_request_id", "offer_request_id TEXT");
  ensureColumn(db, "dashboard_run_rows", "top_offers_json", "top_offers_json TEXT");
  ensureColumn(db, "dashboard_run_rows", "marketing_carrier_code", "marketing_carrier_code TEXT");
  ensureColumn(db, "dashboard_run_rows", "website_mode", "website_mode TEXT NOT NULL DEFAULT 'dash'");
  ensureColumn(db, "dashboard_run_rows", "booking_needs_verify", "booking_needs_verify INTEGER NOT NULL DEFAULT 0");

  return db;
}

export function runStart(db, startedAt) {
  const stmt = db.prepare(`INSERT INTO runs (started_at) VALUES (?)`);
  const result = stmt.run(startedAt);
  return Number(result.lastInsertRowid);
}

export function runFinish(db, runId, payload) {
  const stmt = db.prepare(`
    UPDATE runs
    SET completed_at = ?,
        scanned_pairs = ?,
        offers_seen = ?,
        offers_matched = ?,
        new_alerts = ?,
        emailed = ?,
        error = ?
    WHERE id = ?
  `);

  stmt.run(
    payload.completedAt,
    payload.scannedPairs,
    payload.offersSeen,
    payload.offersMatched,
    payload.newAlerts,
    payload.emailed,
    payload.error || null,
    runId
  );
}

export function hasSeen(db, fingerprint) {
  const stmt = db.prepare(`SELECT fingerprint FROM seen_alerts WHERE fingerprint = ?`);
  const row = stmt.get(fingerprint);
  return Boolean(row);
}

export function upsertSeen(db, fingerprint, nowIso, payloadJson) {
  const stmt = db.prepare(`
    INSERT INTO seen_alerts (fingerprint, first_seen_at, last_seen_at, payload_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(fingerprint) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      payload_json = excluded.payload_json
  `);
  stmt.run(fingerprint, nowIso, nowIso, payloadJson);
}

export function setSetting(db, key, value) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  stmt.run(key, value);
}

export function getSetting(db, key) {
  const stmt = db.prepare(`SELECT value FROM settings WHERE key = ?`);
  const row = stmt.get(key);
  return row ? row.value : null;
}

export function listRuns(db, limit = 20) {
  const stmt = db.prepare(`
    SELECT *
    FROM runs
    ORDER BY id DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

export function listSeen(db, limit = 50) {
  const stmt = db.prepare(`
    SELECT fingerprint, first_seen_at, last_seen_at, payload_json
    FROM seen_alerts
    ORDER BY last_seen_at DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

export function createDashboardRun(db, payload) {
  const stmt = db.prepare(`
    INSERT INTO dashboard_runs (
      started_at,
      status,
      origin,
      lookahead_days,
      total_tasks,
      completed_tasks,
      next_run_at,
      error
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    payload.startedAt,
    payload.status,
    payload.origin,
    payload.lookaheadDays,
    payload.totalTasks || 0,
    payload.completedTasks || 0,
    payload.nextRunAt || null,
    payload.error || null
  );
  return Number(result.lastInsertRowid);
}

export function updateDashboardRunProgress(db, runId, payload) {
  const stmt = db.prepare(`
    UPDATE dashboard_runs
    SET total_tasks = ?, completed_tasks = ?, next_run_at = ?
    WHERE id = ?
  `);
  stmt.run(payload.totalTasks || 0, payload.completedTasks || 0, payload.nextRunAt || null, runId);
}

export function completeDashboardRun(db, runId, payload) {
  const stmt = db.prepare(`
    UPDATE dashboard_runs
    SET completed_at = ?, status = ?, total_tasks = ?, completed_tasks = ?, next_run_at = ?, error = ?
    WHERE id = ?
  `);
  stmt.run(
    payload.completedAt || null,
    payload.status || "completed",
    payload.totalTasks || 0,
    payload.completedTasks || 0,
    payload.nextRunAt || null,
    payload.error || null,
    runId
  );
}

export function insertDashboardRunRows(db, runId, rows) {
  const insert = db.prepare(`
    INSERT INTO dashboard_run_rows (
      run_id,
      flight_date,
      departure_time_local,
      departure_local_iso,
      airline,
      carrier_code,
      marketing_carrier_code,
      flight_number,
      origin,
      destination_city,
      destination_iata,
      fr24_status,
      availability_status,
      bookability_status,
      offer_request_id,
      available_offer_count,
      matched_offer_count,
      seats_min,
      price_amount,
      price_currency,
      offer_airline,
      top_offers_json,
      booking_url,
      website_mode,
      booking_needs_verify,
      observed_at
    )
    VALUES (
      @run_id,
      @flight_date,
      @departure_time_local,
      @departure_local_iso,
      @airline,
      @carrier_code,
      @marketing_carrier_code,
      @flight_number,
      @origin,
      @destination_city,
      @destination_iata,
      @fr24_status,
      @availability_status,
      @bookability_status,
      @offer_request_id,
      @available_offer_count,
      @matched_offer_count,
      @seats_min,
      @price_amount,
      @price_currency,
      @offer_airline,
      @top_offers_json,
      @booking_url,
      @website_mode,
      @booking_needs_verify,
      @observed_at
    )
  `);

  const transaction = db.transaction((rowsToInsert) => {
    for (const row of rowsToInsert) {
      insert.run({
        run_id: runId,
        flight_date: row.flightDate,
        departure_time_local: row.departureTimeLocal,
        departure_local_iso: row.departureLocalIso,
        airline: row.airline,
        carrier_code: row.carrierCode || null,
        marketing_carrier_code: row.marketingCarrierCode || null,
        flight_number: row.flightNumber || null,
        origin: row.origin,
        destination_city: row.destinationCity,
        destination_iata: row.destinationIata,
        fr24_status: row.fr24Status,
        availability_status: row.availabilityStatus,
        bookability_status: row.bookabilityStatus || "PENDING",
        offer_request_id: row.offerRequestId || null,
        available_offer_count: row.availableOfferCount || 0,
        matched_offer_count: row.matchedOfferCount || 0,
        seats_min: Number.isInteger(row.seatsMin) ? row.seatsMin : null,
        price_amount: row.priceAmount || null,
        price_currency: row.priceCurrency || null,
        offer_airline: row.offerAirline || null,
        top_offers_json: Array.isArray(row.topOffers) ? JSON.stringify(row.topOffers) : null,
        booking_url: row.bookingUrl || null,
        website_mode: row.websiteMode || "dash",
        booking_needs_verify: row.bookingNeedsVerify ? 1 : 0,
        observed_at: row.observedAt
      });
    }
  });

  transaction(rows);
}

export function getLatestDashboardRun(db) {
  const stmt = db.prepare(`
    SELECT *
    FROM dashboard_runs
    ORDER BY id DESC
    LIMIT 1
  `);
  return stmt.get() || null;
}

export function getLatestCompletedDashboardRun(db) {
  const stmt = db.prepare(`
    SELECT *
    FROM dashboard_runs
    WHERE status = 'completed'
    ORDER BY id DESC
    LIMIT 1
  `);
  return stmt.get() || null;
}

export function getDashboardRunRows(db, runId) {
  const stmt = db.prepare(`
    SELECT *
    FROM dashboard_run_rows
    WHERE run_id = ?
    ORDER BY
      CASE bookability_status
        WHEN 'BOOKABLE_NOW' THEN 1
        WHEN 'NOT_BOOKABLE_NOW' THEN 2
        WHEN 'ERROR' THEN 3
        ELSE 4
      END ASC,
      CASE availability_status
        WHEN 'AVAILABLE_EXACT' THEN 1
        WHEN 'AVAILABLE_ROUTE' THEN 2
        WHEN 'NO_OFFER' THEN 3
        WHEN 'ERROR' THEN 4
        ELSE 5
      END ASC,
      CASE
        WHEN seats_min IS NULL THEN 999
        ELSE seats_min
      END ASC,
      available_offer_count DESC,
      departure_local_iso ASC
  `);
  return stmt.all(runId);
}

export function clearAvailabilityData(db) {
  const count = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;

  const before = {
    dashboardRunRows: count("dashboard_run_rows"),
    dashboardRuns: count("dashboard_runs"),
    runs: count("runs"),
    seenAlerts: count("seen_alerts")
  };

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM dashboard_run_rows").run();
    db.prepare("DELETE FROM dashboard_runs").run();
    db.prepare("DELETE FROM runs").run();
    db.prepare("DELETE FROM seen_alerts").run();
    db.prepare(
      "DELETE FROM settings WHERE key IN ('dashboard_last_completed_run_id', 'dashboard_last_completed_at', 'dashboard_next_run_at', 'last_run_at')"
    ).run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('dashboard_run_rows', 'dashboard_runs', 'runs')").run();
  });

  transaction();

  return before;
}
