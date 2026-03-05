import { resolveAirlineBooking } from "../airlineLinks.js";

/**
 * Maps a camelCase dashboard row into the simplified flights table schema.
 * Dubai is always UTC+4 (no DST), so we append "+04:00" to the local ISO string.
 */
function toFlightRow(runId, row) {
  const flightNo = [
    String(row.carrierCode || "").trim(),
    String(row.flightNumber || "").trim()
  ].filter(Boolean).join("") || null;

  // departure_at: convert local Dubai time to proper timestamptz
  let departureAt = null;
  if (row.departureLocalIso) {
    departureAt = row.departureLocalIso + "+04:00";
  }

  return {
    run_id: runId,
    date: row.flightDate,
    airline: row.airline || null,
    iata_code: row.marketingCarrierCode || row.carrierCode || null,
    flight_no: flightNo,
    origin: row.origin || null,
    destination: row.destinationIata || null,
    departure_at: departureAt,
    arrival_at: null,
    stops: 0,
    price_usd: row.priceAmount ? Number.parseFloat(row.priceAmount) || null : null,
    seats: Number.isInteger(row.seatsMin) ? row.seatsMin : null,
    offer_id: Array.isArray(row.topOffers) && row.topOffers.length > 0
      ? row.topOffers[0].offerId || null
      : null
  };
}

/**
 * Converts a Supabase flights row back into the camelCase shape the frontend expects.
 * Computes bookabilityStatus and booking URL at read time from stored data.
 */
function fromFlightRow(row) {
  const iataCode = String(row.iata_code || "").trim().toUpperCase();
  const flightNo = String(row.flight_no || "").trim().toUpperCase();

  // Extract carrier code and flight number from combined flight_no
  let carrierCode = iataCode;
  let flightNumber = "";
  if (flightNo && iataCode && flightNo.startsWith(iataCode)) {
    flightNumber = flightNo.slice(iataCode.length);
  } else if (flightNo) {
    // Try to split: first 2 chars are carrier, rest is number
    const match = flightNo.match(/^([A-Z0-9]{2})(\d+[A-Z]?)$/);
    if (match) {
      carrierCode = match[1];
      flightNumber = match[2];
    } else {
      flightNumber = flightNo;
    }
  }

  const destination = String(row.destination || "").trim().toUpperCase();

  // Compute departure time in Dubai local format
  let departureTimeLocal = "";
  let departureLocalIso = "";
  if (row.departure_at) {
    const d = new Date(row.departure_at);
    // Format in Dubai time
    departureTimeLocal = d.toLocaleTimeString("en-US", {
      timeZone: "Asia/Dubai",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
    // Reconstruct local ISO for sorting
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dubai",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false
    }).formatToParts(d);
    const get = (type) => (parts.find((p) => p.type === type) || {}).value || "00";
    departureLocalIso = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
  }

  const hasSeats = Number.isInteger(row.seats) && row.seats > 0;
  const hasPrice = row.price_usd !== null && row.price_usd !== undefined && Number(row.price_usd) > 0;
  const bookabilityStatus = hasSeats || hasPrice ? "BOOKABLE_NOW" : "NOT_BOOKABLE_NOW";
  const availabilityStatus = hasPrice ? "AVAILABLE_EXACT" : "NO_OFFER";

  const origin = String(row.origin || "").trim().toUpperCase();
  const booking = resolveAirlineBooking({
    airlineName: row.airline || "",
    carrierCode,
    marketingCarrierCode: iataCode,
    from: origin,
    to: destination,
    date: row.date
  });

  return {
    id: row.id,
    runId: row.run_id,
    flightDate: row.date,
    departureTimeLocal,
    departureLocalIso,
    airline: row.airline || "",
    carrierCode,
    marketingCarrierCode: iataCode,
    flightNumber,
    origin,
    destinationCity: destination,
    destinationIata: destination,
    fr24Status: "Scheduled",
    availabilityStatus,
    bookabilityStatus,
    offerRequestId: "",
    availableOfferCount: hasPrice ? 1 : 0,
    matchedOfferCount: hasPrice ? 1 : 0,
    seatsMin: Number.isInteger(row.seats) ? row.seats : null,
    priceAmount: row.price_usd !== null && row.price_usd !== undefined ? String(row.price_usd) : "",
    priceCurrency: row.price_usd !== null && row.price_usd !== undefined ? "USD" : "",
    offerAirline: row.airline || "",
    topOffers: [],
    bookingUrl: booking.bookingUrl,
    websiteMode: booking.websiteMode,
    bookingNeedsVerify: Boolean(booking.bookingNeedsVerify),
    observedAt: row.created_at || ""
  };
}

function normalizeRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    origin: row.origin,
    lookaheadDays: 0,
    totalTasks: row.total_checked || 0,
    completedTasks: row.total_checked || 0,
    nextRunAt: null,
    error: ""
  };
}

export function createSupabaseStorage(supabase) {
  return {
    async createRun(payload) {
      const { data, error } = await supabase
        .from("runs")
        .insert({
          started_at: payload.startedAt,
          status: "running",
          origin: payload.origin,
          total_checked: 0,
          total_found: 0
        })
        .select("id")
        .single();

      if (error) {
        const message = String(error.message || "");
        const details = String(error.details || "");
        const hint = String(error.hint || "");
        const combined = `${message} ${details} ${hint}`.toLowerCase();
        const isRunningConstraint =
          error.code === "23505" &&
          (combined.includes("runs_one_running") || combined.includes("status") && combined.includes("running"));

        if (isRunningConstraint) {
          const runErr = new Error("createRun failed: another run is already in progress");
          runErr.code = "RUN_ALREADY_IN_PROGRESS";
          throw runErr;
        }

        throw new Error(`createRun failed: ${error.message}`);
      }
      console.log(`[supabase] run created id=${data.id} status=running`);
      return data.id;
    },

    async updateRunProgress(runId, payload) {
      const { error } = await supabase
        .from("runs")
        .update({
          total_checked: payload.totalTasks || payload.totalChecked || 0,
          total_found: payload.completedTasks || payload.totalFound || 0
        })
        .eq("id", runId);

      if (error) throw new Error(`updateRunProgress failed: ${error.message}`);
    },

    async insertFlights(runId, rows) {
      if (!rows || rows.length === 0) return;

      const dbRows = rows.map((row) => toFlightRow(runId, row));

      // Supabase bulk insert; chunk if large
      const CHUNK = 500;
      for (let i = 0; i < dbRows.length; i += CHUNK) {
        const chunk = dbRows.slice(i, i + CHUNK);
        const { error } = await supabase.from("flights").insert(chunk);
        if (error) throw new Error(`insertFlights failed at offset ${i}: ${error.message}`);
      }

      console.log(`[supabase] inserted ${dbRows.length} flights for run ${runId}`);
    },

    async finalizeRun(runId, payload) {
      const isSuccess = payload.status === "completed";
      const totalFound = payload.completedTasks || payload.totalFound || 0;

      const { error } = await supabase.rpc("finalize_evac_run", {
        p_run_id: runId,
        p_completed_at: payload.completedAt,
        p_total_checked: payload.totalTasks || payload.totalChecked || 0,
        p_total_found: totalFound,
        p_success: isSuccess,
        p_error: payload.error || null
      });

      if (error) throw new Error(`finalizeRun RPC failed: ${error.message}`);

      const newStatus = isSuccess && totalFound > 0 ? "active" : "archived";
      console.log(`[supabase] run ${runId} finalized → ${newStatus}`);
    },

    async getActiveSnapshot() {
      // Get the active run
      const { data: run, error: runErr } = await supabase
        .from("runs")
        .select("*")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (runErr) throw new Error(`getActiveSnapshot run query failed: ${runErr.message}`);
      if (!run) return null;

      // Get flights for the active run, only future departures in Dubai time
      const { data: flights, error: flightErr } = await supabase
        .from("flights")
        .select("*")
        .eq("run_id", run.id)
        .gt("departure_at", new Date().toISOString())
        .order("departure_at", { ascending: true })
        .order("price_usd", { ascending: true, nullsFirst: false });

      if (flightErr) throw new Error(`getActiveSnapshot flights query failed: ${flightErr.message}`);

      return {
        run: normalizeRun(run),
        rows: (flights || []).map(fromFlightRow)
      };
    },

    async getLatestRun() {
      const { data, error } = await supabase
        .from("runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`getLatestRun failed: ${error.message}`);
      return data || null;
    },

    async clearAllData() {
      // Flights cascade-delete with runs, so just delete runs
      const { data: runsBefore } = await supabase.from("runs").select("id", { count: "exact" });
      const { data: flightsBefore } = await supabase.from("flights").select("id", { count: "exact" });

      const { error } = await supabase.from("runs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw new Error(`clearAllData failed: ${error.message}`);

      const deleted = {
        dashboardRunRows: flightsBefore?.length || 0,
        dashboardRuns: runsBefore?.length || 0,
        runs: 0,
        seenAlerts: 0
      };

      console.log(`[supabase] cleared all data: ${deleted.dashboardRuns} runs, ${deleted.dashboardRunRows} flights`);
      return deleted;
    },

    async cleanupStaleRuns() {
      const { data, error } = await supabase
        .from("runs")
        .update({ status: "archived", completed_at: new Date().toISOString() })
        .eq("status", "running")
        .select("id");

      if (error) throw new Error(`cleanupStaleRuns failed: ${error.message}`);
      return data?.length || 0;
    },

    /** Returns normalized run for getActiveSnapshot().run */
    normalizeRun
  };
}
