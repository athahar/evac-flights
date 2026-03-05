const state = {
  schedulerRunning: false,
  nextRunAt: null,
  mostRecent: null,
  currentRun: null
};

const els = {
  nextRunAt: document.querySelector("#nextRunAt"),
  countdown: document.querySelector("#countdown"),
  latestRunAt: document.querySelector("#latestRunAt"),
  latestRunStats: document.querySelector("#latestRunStats"),
  currentRunStatus: document.querySelector("#currentRunStatus"),
  currentRunProgress: document.querySelector("#currentRunProgress"),
  recentTableBody: document.querySelector("#recentTableBody"),
  currentTableBody: document.querySelector("#currentTableBody"),
  runNowBtn: document.querySelector("#runNowBtn"),
  toggleSchedulerBtn: document.querySelector("#toggleSchedulerBtn"),
  clearRunsBtn: document.querySelector("#clearRunsBtn"),
  tabs: [...document.querySelectorAll(".tab")],
  panels: {
    recent: document.querySelector("#panel-recent"),
    current: document.querySelector("#panel-current")
  }
};

function fmtDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(d);
}

function fmtPrice(amount, currency) {
  if (!amount) return "-";
  const curr = String(currency || "USD").trim().toUpperCase();
  const parsed = Number.parseFloat(String(amount).replace(/,/g, ""));
  if (!Number.isFinite(parsed)) {
    return `${curr} ${amount}`.trim();
  }
  const roundedUp = Math.ceil(parsed);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(roundedUp);
  return `${curr} ${formatted}`.trim();
}

function formatFlightCode(row) {
  const carrier = String(row.carrierCode || "").trim().toUpperCase();
  const number = String(row.flightNumber || "").trim().toUpperCase();
  if (carrier && number) return `${carrier}${number}`;
  if (row.flight) return row.flight;
  if (number) return number;
  return "-";
}

function formatAirlineName(airline) {
  const text = String(airline || "").trim();
  if (!text) return "-";

  // Keep this short in table rows; full value is shown via title tooltip.
  if (text.startsWith("Air India Express")) {
    return text.length > 18 ? "Air India Express…" : text;
  }

  const max = 24;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatToLocation(row) {
  const iata = String(row.destinationIata || "").trim().toUpperCase();
  const city = String(row.destinationCity || "").trim();
  const country = String(row.destinationCountry || "").trim();

  if (city && country && iata) return `${city}, ${country} (${iata})`;
  if (city && iata) return `${city} (${iata})`;
  if (city) return city;
  return iata || "-";
}

function chipClass(status) {
  if (status === "BOOKABLE_NOW") return "status-chip status-yes";
  if (status === "NOT_BOOKABLE_NOW" || status === "ERROR") return "status-chip status-no";
  if (status === "AVAILABLE_EXACT" || status === "AVAILABLE_ROUTE") return "status-chip status-yes";
  if (status === "NO_OFFER") return "status-chip status-no";
  return "status-chip status-checking";
}

function chipLabel(status) {
  if (status === "BOOKABLE_NOW") return "Yes";
  if (status === "NOT_BOOKABLE_NOW" || status === "ERROR") return "No";
  if (status === "AVAILABLE_EXACT" || status === "AVAILABLE_ROUTE") return "Yes";
  if (status === "NO_OFFER") return "No";
  return "Checking";
}

function offerSummaryTooltip(row) {
  const requestId = row.offerRequestId ? `Request: ${row.offerRequestId}` : "";
  const top = Array.isArray(row.topOffers) ? row.topOffers : [];
  if (top.length === 0) return requestId;

  const lines = top.map((offer, idx) => {
    const code = String(offer.carrierCode || "").trim().toUpperCase();
    const name = String(offer.carrierName || "").trim();
    const carrier = code || name || "Carrier";
    const depart = String(offer.departAt || "").trim() || "n/a";
    const price = offer.priceAmount ? `${offer.priceAmount} ${offer.priceCurrency || ""}`.trim() : "n/a";
    const segments = Number.isInteger(offer.segments) ? offer.segments : "n/a";
    return `${idx + 1}) ${carrier} | ${price} | dep ${depart} | seg ${segments}`;
  });

  return [requestId, ...lines].filter(Boolean).join("\n");
}

function renderWebsiteCell(row) {
  const mode = String(row.websiteMode || "").trim().toLowerCase();
  const url = String(row.bookingUrl || "").trim();
  const showVerify = Boolean(row.bookingNeedsVerify);
  const warning = showVerify ? `<span class="warning-icon" title="Verify airline website before dispatch">⚠️</span>` : "";

  if (mode === "link" && url) {
    return `<a class="link" href="${url}" target="_blank" rel="noopener noreferrer">Open</a>${warning}`;
  }

  if (mode === "none") {
    return "";
  }

  if (url) {
    return `<a class="link" href="${url}" target="_blank" rel="noopener noreferrer">Open</a>${warning}`;
  }

  return "-";
}

function renderTable(target, rows) {
  target.innerHTML = "";

  if (!rows || rows.length === 0) {
    target.innerHTML = `<tr><td colspan="9">No data yet.</td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const tr = document.createElement("tr");
    const airlineFull = row.airline || "-";
    const airlineShort = formatAirlineName(airlineFull);
    const flightCode = formatFlightCode(row);
    const bookabilityStatus = row.bookabilityStatus || row.availabilityStatus || "PENDING";
    const priceTooltip = offerSummaryTooltip(row);
    tr.innerHTML = `
      <td>${row.flightDate || "-"}</td>
      <td>${row.departureTimeLocal || "-"}</td>
      <td><span class="truncate-airline" title="${airlineFull}">${airlineShort}</span></td>
      <td>${flightCode}</td>
      <td>${row.origin || "-"}</td>
      <td title="${formatToLocation(row)}">${formatToLocation(row)}</td>
      <td><span class="${chipClass(bookabilityStatus)}">${chipLabel(bookabilityStatus)}</span></td>
      <td title="${priceTooltip}">${fmtPrice(row.priceAmount, row.priceCurrency)}</td>
      <td>${renderWebsiteCell(row)}</td>
    `;
    fragment.appendChild(tr);
  }

  target.appendChild(fragment);
}

function sortRows(rows) {
  const rank = {
    BOOKABLE_NOW: 1,
    NOT_BOOKABLE_NOW: 2,
    ERROR: 3,
    PENDING: 4,
    AVAILABLE_EXACT: 1,
    AVAILABLE_ROUTE: 2,
    NO_OFFER: 3,
    ERROR_LEGACY: 4,
    PENDING_LEGACY: 5
  };

  return [...rows].sort((a, b) => {
    const aStatus = a.bookabilityStatus || a.availabilityStatus || "PENDING";
    const bStatus = b.bookabilityStatus || b.availabilityStatus || "PENDING";
    const r = (rank[aStatus] || 99) - (rank[bStatus] || 99);
    if (r !== 0) return r;
    const aSeats = Number.isInteger(a.seatsMin) ? a.seatsMin : 999;
    const bSeats = Number.isInteger(b.seatsMin) ? b.seatsMin : 999;
    if (aSeats !== bSeats) return aSeats - bSeats;
    return String(a.departureLocalIso || "").localeCompare(String(b.departureLocalIso || ""));
  });
}

function renderMeta() {
  els.nextRunAt.textContent = state.nextRunAt ? fmtDateTime(state.nextRunAt) : "-";

  const mostRecentRun = state.mostRecent?.run || null;
  els.latestRunAt.textContent = mostRecentRun?.completedAt ? fmtDateTime(mostRecentRun.completedAt) : "-";
  els.latestRunStats.textContent = mostRecentRun
    ? `${state.mostRecent.rows.length} flights • ${mostRecentRun.completedTasks}/${mostRecentRun.totalTasks} checks`
    : "No completed run yet";

  if (state.currentRun) {
    els.currentRunStatus.textContent = state.currentRun.status === "running" ? "Running" : state.currentRun.status;
    els.currentRunProgress.textContent = `${state.currentRun.completedTasks}/${state.currentRun.totalTasks} checks`;
  } else {
    els.currentRunStatus.textContent = "Idle";
    els.currentRunProgress.textContent = state.schedulerRunning ? "Waiting for next scan" : "Ready for manual Run Now";
  }

  els.toggleSchedulerBtn.textContent = state.schedulerRunning ? "Pause Scheduler" : "Resume Scheduler";
}

function renderAll() {
  renderMeta();
  renderTable(els.recentTableBody, sortRows(state.mostRecent?.rows || []));
  renderTable(els.currentTableBody, sortRows(state.currentRun?.rows || []));
}

async function fetchState() {
  const res = await fetch("/api/dashboard/state");
  if (!res.ok) {
    throw new Error(`Failed to fetch state: ${res.status}`);
  }
  const payload = await res.json();
  state.schedulerRunning = Boolean(payload.schedulerRunning);
  state.nextRunAt = payload.nextRunAt || null;
  state.mostRecent = payload.mostRecent || null;
  state.currentRun = payload.currentRun || null;
  renderAll();
}

function attachTabs() {
  for (const tab of els.tabs) {
    tab.addEventListener("click", () => {
      for (const t of els.tabs) t.classList.remove("active");
      tab.classList.add("active");
      const target = tab.getAttribute("data-tab");
      for (const [key, panel] of Object.entries(els.panels)) {
        panel.classList.toggle("active", key === target);
      }
    });
  }
}

function attachActions() {
  els.runNowBtn.addEventListener("click", async () => {
    els.runNowBtn.disabled = true;
    try {
      await fetch("/api/dashboard/run-now", { method: "POST" });
    } finally {
      setTimeout(() => {
        els.runNowBtn.disabled = false;
      }, 1500);
    }
  });

  els.toggleSchedulerBtn.addEventListener("click", async () => {
    const endpoint = state.schedulerRunning
      ? "/api/dashboard/scheduler/stop"
      : "/api/dashboard/scheduler/start";
    await fetch(endpoint, { method: "POST" });
    await fetchState();
  });

  els.clearRunsBtn.addEventListener("click", async () => {
    const ok = window.confirm(
      "Clear all run history and availability results? This keeps input/filter files but removes board run data."
    );
    if (!ok) return;

    els.clearRunsBtn.disabled = true;
    try {
      const res = await fetch("/api/dashboard/clear-runs", { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(payload?.error || `Failed to clear runs (${res.status})`);
        return;
      }
      await fetchState();
    } finally {
      els.clearRunsBtn.disabled = false;
    }
  });
}

function connectEvents() {
  const source = new EventSource("/api/dashboard/events");

  source.addEventListener("run_started", (event) => {
    const payload = JSON.parse(event.data);
    state.currentRun = payload.currentRun;
    state.mostRecent = payload.mostRecent || state.mostRecent;
    renderAll();
  });

  source.addEventListener("task_progress", (event) => {
    const payload = JSON.parse(event.data);
    if (!state.currentRun || state.currentRun.id !== payload.runId) return;

    state.currentRun.completedTasks = payload.completedTasks;
    const map = new Map(state.currentRun.rows.map((r) => [r.id, r]));
    for (const changed of payload.changedRows || []) {
      map.set(changed.id, changed);
    }
    state.currentRun.rows = [...map.values()];
    renderAll();
  });

  source.addEventListener("run_completed", (event) => {
    const payload = JSON.parse(event.data);
    state.currentRun = null;
    state.nextRunAt = payload.nextRunAt || state.nextRunAt;
    if (payload.mostRecent) {
      state.mostRecent = payload.mostRecent;
    }
    renderAll();
  });

  source.addEventListener("run_failed", () => {
    fetchState().catch(() => {});
  });

  source.addEventListener("scheduler_tick", (event) => {
    const payload = JSON.parse(event.data);
    state.nextRunAt = payload.nextRunAt || state.nextRunAt;
    renderMeta();
  });

  source.addEventListener("runs_cleared", () => {
    fetchState().catch(() => {});
  });

  source.onerror = () => {
    source.close();
    setTimeout(connectEvents, 2000);
  };
}

function startCountdown() {
  setInterval(() => {
    if (!state.nextRunAt) {
      els.countdown.textContent = "-";
      return;
    }
    const diffMs = new Date(state.nextRunAt).getTime() - Date.now();
    if (diffMs <= 0) {
      els.countdown.textContent = "Running soon";
      return;
    }

    const totalSec = Math.floor(diffMs / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    els.countdown.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, 1000);
}

attachTabs();
attachActions();
startCountdown();
fetchState().catch((err) => {
  console.error(err);
});
connectEvents();
