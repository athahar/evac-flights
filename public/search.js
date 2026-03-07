const state = {
  searchEnabled: true,
  searchMaxDestinations: 3,
  searchCooldownSeconds: 120,
  searchCacheTtlSeconds: 300,
  searchDateRangeDays: 7,
  searchAllowedOrigins: ["DXB", "MCT"],
  airports: [],
  airportsByIata: new Map(),
  selectedDestinations: [],
  isSubmitting: false
};

const analytics = {
  enabled: false,
  key: "",
  host: "https://us.i.posthog.com",
  distinctId: ""
};

const els = {
  searchForm: document.querySelector("#searchForm"),
  originSelect: document.querySelector("#originSelect"),
  departureDate: document.querySelector("#departureDate"),
  destinationInput: document.querySelector("#destinationInput"),
  destinationSuggestions: document.querySelector("#destinationSuggestions"),
  destinationChips: document.querySelector("#destinationChips"),
  searchBtn: document.querySelector("#searchBtn"),
  searchStatus: document.querySelector("#searchStatus"),
  resultsSection: document.querySelector("#resultsSection"),
  resultSummary: document.querySelector("#resultSummary"),
  resultErrors: document.querySelector("#resultErrors"),
  resultGroups: document.querySelector("#resultGroups")
};

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getDubaiDateIso(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function setStatus(text, tone = "muted") {
  els.searchStatus.textContent = text || "";
  els.searchStatus.style.color =
    tone === "bad"
      ? "#a23535"
      : tone === "ok"
        ? "#0d7a4e"
        : "#5f738a";
}

function getOrCreateDistinctId() {
  const key = "evac_posthog_distinct_id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
  } catch {}

  const id = window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  try {
    window.localStorage.setItem(key, id);
  } catch {}
  return id;
}

function trackEvent(event, properties = {}) {
  if (!analytics.enabled || !analytics.key) return;

  const payload = JSON.stringify({
    api_key: analytics.key,
    event,
    properties: {
      distinct_id: analytics.distinctId,
      app: "dxb-flight-tracker",
      page: "search",
      path: window.location.pathname,
      href: window.location.href,
      ...properties
    }
  });

  const endpoint = `${analytics.host.replace(/\/$/, "")}/capture/`;
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
      return;
    }
  } catch {}

  fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true
  }).catch(() => {});
}

async function loadPublicConfig() {
  const res = await fetch("/api/public-config", { cache: "no-store" });
  if (!res.ok) throw new Error(`public-config failed (${res.status})`);
  return res.json();
}

async function loadAirports() {
  const res = await fetch("/data/airports.curated.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`airports list failed (${res.status})`);
  const list = await res.json();
  const airports = Array.isArray(list) ? list : [];
  state.airports = airports
    .map((item) => ({
      iata: upper(item?.iata),
      name: String(item?.name || "").trim(),
      city: String(item?.city || "").trim(),
      country: upper(item?.country)
    }))
    .filter((item) => item.iata && item.name)
    .sort((a, b) => a.iata.localeCompare(b.iata));

  state.airportsByIata = new Map(state.airports.map((item) => [item.iata, item]));
}

function renderOriginOptions() {
  const origins = (Array.isArray(state.searchAllowedOrigins) && state.searchAllowedOrigins.length > 0)
    ? state.searchAllowedOrigins
    : ["DXB"];

  els.originSelect.innerHTML = origins
    .map((origin) => `<option value="${escapeHtml(origin)}">${escapeHtml(origin)}</option>`)
    .join("");
}

function renderDateBounds() {
  const today = new Date();
  const min = getDubaiDateIso(today);
  const max = getDubaiDateIso(addDays(today, state.searchDateRangeDays));

  els.departureDate.min = min;
  els.departureDate.max = max;
  if (!els.departureDate.value) {
    els.departureDate.value = min;
  }
}

function renderChips() {
  els.destinationChips.innerHTML = "";
  if (state.selectedDestinations.length === 0) return;

  state.selectedDestinations.forEach((iata) => {
    const airport = state.airportsByIata.get(iata);
    const label = airport
      ? `${airport.iata} · ${airport.city || airport.name}`
      : iata;

    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `${escapeHtml(label)} <button type="button" aria-label="Remove ${escapeHtml(iata)}">×</button>`;
    chip.querySelector("button")?.addEventListener("click", () => {
      state.selectedDestinations = state.selectedDestinations.filter((code) => code !== iata);
      renderChips();
      renderSuggestions(els.destinationInput.value);
    });
    els.destinationChips.appendChild(chip);
  });
}

function addDestination(iata) {
  const code = upper(iata);
  if (!code) return;
  if (state.selectedDestinations.includes(code)) {
    setStatus(`${code} is already selected`, "muted");
    return;
  }
  if (state.selectedDestinations.length >= state.searchMaxDestinations) {
    setStatus(`You can select up to ${state.searchMaxDestinations} destinations`, "bad");
    return;
  }

  state.selectedDestinations.push(code);
  els.destinationInput.value = "";
  hideSuggestions();
  renderChips();
  setStatus("");
}

function hideSuggestions() {
  els.destinationSuggestions.hidden = true;
  els.destinationSuggestions.innerHTML = "";
}

function searchAirportMatches(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];

  return state.airports
    .filter((item) => !state.selectedDestinations.includes(item.iata))
    .filter((item) => {
      return item.iata.toLowerCase().includes(q)
        || item.name.toLowerCase().includes(q)
        || item.city.toLowerCase().includes(q)
        || item.country.toLowerCase().includes(q);
    })
    .slice(0, 12);
}

function renderSuggestions(query) {
  const matches = searchAirportMatches(query);
  if (matches.length === 0) {
    hideSuggestions();
    return;
  }

  els.destinationSuggestions.innerHTML = matches.map((item) => {
    const sub = [item.name, item.city, item.country].filter(Boolean).join(" · ");
    return `
      <li>
        <button class="suggestion" type="button" data-iata="${escapeHtml(item.iata)}">
          <strong>${escapeHtml(item.iata)}</strong>
          <span class="suggestion-line">${escapeHtml(sub)}</span>
        </button>
      </li>
    `;
  }).join("");

  for (const btn of els.destinationSuggestions.querySelectorAll("button[data-iata]")) {
    btn.addEventListener("click", () => addDestination(btn.dataset.iata));
  }

  els.destinationSuggestions.hidden = false;
}

function fmtDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

function renderResults(payload) {
  els.resultsSection.hidden = false;
  const sourceLabel = payload.source === "cache" ? "Cache" : "Live";
  els.resultSummary.innerHTML = `
    <strong>${sourceLabel} result</strong><br />
    Origin ${escapeHtml(payload.origin)} · Date ${escapeHtml(payload.departureDate)} · Checked ${payload.pairsChecked} pairs · Offers ${payload.offersFound} · ${payload.durationMs} ms
  `;

  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  if (errors.length > 0) {
    els.resultErrors.hidden = false;
    els.resultErrors.innerHTML = errors
      .map((entry) => `• ${escapeHtml(entry.destinationIata || "-")} (${escapeHtml(entry.destinationName || "-")}): ${escapeHtml(entry.error || "search failed")}`)
      .join("<br />");
  } else {
    els.resultErrors.hidden = true;
    els.resultErrors.innerHTML = "";
  }

  const groups = Array.isArray(payload.results) ? payload.results : [];
  if (groups.length === 0) {
    els.resultGroups.innerHTML = `<section class="result-group"><p class="no-offers">No offers found for selected destinations.</p></section>`;
    return;
  }

  els.resultGroups.innerHTML = groups.map((group) => {
    const offers = Array.isArray(group.offers) ? group.offers : [];
    const offersHtml = offers.length === 0
      ? `<p class="no-offers">No offers found.</p>`
      : `<div class="offer-list">${offers.map((offer) => {
        const airlineLabel = [offer.airline, `${offer.carrierCode || ""}${offer.flightNumber || ""}`.trim()].filter(Boolean).join(" · ");
        const bookingHtml = offer.websiteMode === "link" && offer.bookingUrl
          ? `<a class="offer-link" href="${escapeHtml(offer.bookingUrl)}" target="_blank" rel="noopener noreferrer">Open booking</a>`
          : `<span class="offer-dash">-</span>`;

        return `
          <article class="offer">
            <div class="offer-top">
              <div class="offer-title">${escapeHtml(airlineLabel || "Offer")}</div>
              <div class="offer-price">${escapeHtml(offer.priceCurrency || "USD")} ${escapeHtml(offer.priceAmount || "-")}</div>
            </div>
            <div class="offer-meta">${escapeHtml(fmtDateTime(offer.departAt))} → ${escapeHtml(fmtDateTime(offer.arriveAt))} · Stops ${escapeHtml(String(offer.stops ?? "-"))}</div>
            ${bookingHtml}
          </article>
        `;
      }).join("")}</div>`;

    return `
      <section class="result-group">
        <div class="group-head">
          <h2 class="group-title">${escapeHtml(group.destinationIata)} · ${escapeHtml(group.destinationName || group.destinationIata)}</h2>
          <span class="group-sub">Top ${offers.length} offer${offers.length === 1 ? "" : "s"}</span>
        </div>
        ${offersHtml}
      </section>
    `;
  }).join("");
}

function setSubmitting(value) {
  state.isSubmitting = Boolean(value);
  els.searchBtn.disabled = state.isSubmitting;
  els.destinationInput.disabled = state.isSubmitting;
  els.originSelect.disabled = state.isSubmitting;
  els.departureDate.disabled = state.isSubmitting;
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.isSubmitting) return;

  if (!state.searchEnabled) {
    setStatus("Search is disabled", "bad");
    return;
  }

  if (state.selectedDestinations.length === 0) {
    setStatus("Select at least one destination", "bad");
    return;
  }

  const payload = {
    origin: upper(els.originSelect.value),
    departureDate: String(els.departureDate.value || "").trim(),
    destinations: [...state.selectedDestinations]
  };

  setSubmitting(true);
  setStatus("Checking live availability…", "muted");

  trackEvent("search_submit", {
    origin: payload.origin,
    departure_date: payload.departureDate,
    destination_count: payload.destinations.length
  });

  try {
    const res = await fetch("/api/search/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const retryAfter = Number(data.retryAfterSeconds || 0);
      if (res.status === 429) {
        setStatus(`Rate limited. Retry in ${retryAfter || "a few"} seconds.`, "bad");
        trackEvent("search_rate_limited", {
          status: res.status,
          retry_after_seconds: retryAfter || 0
        });
      } else {
        setStatus(String(data.error || `Search failed (${res.status})`), "bad");
      }
      return;
    }

    renderResults(data);
    setStatus(data.source === "cache" ? "Loaded cached result" : "Live result loaded", "ok");

    trackEvent("search_result", {
      source: data.source,
      pairs_checked: data.pairsChecked,
      offers_found: data.offersFound,
      duration_ms: data.durationMs
    });

    const failedCount = Array.isArray(data.errors) ? data.errors.length : 0;
    if (failedCount > 0) {
      trackEvent("search_partial_failure", {
        failed_destination_count: failedCount
      });
    }
  } catch (err) {
    setStatus(String(err?.message || "Search failed"), "bad");
  } finally {
    setSubmitting(false);
  }
}

function setupEvents() {
  els.searchForm.addEventListener("submit", handleSubmit);

  els.destinationInput.addEventListener("input", () => {
    renderSuggestions(els.destinationInput.value);
  });

  els.destinationInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const first = els.destinationSuggestions.querySelector("button[data-iata]");
      if (first) {
        addDestination(first.dataset.iata);
      }
    }

    if (event.key === "Escape") {
      hideSuggestions();
    }
  });

  els.destinationInput.addEventListener("blur", () => {
    setTimeout(hideSuggestions, 120);
  });

  document.addEventListener("click", (event) => {
    if (els.destinationSuggestions.hidden) return;
    if (event.target === els.destinationInput || els.destinationSuggestions.contains(event.target)) return;
    hideSuggestions();
  });
}

async function init() {
  try {
    const cfg = await loadPublicConfig();
    state.searchEnabled = Boolean(cfg.searchEnabled);
    state.searchMaxDestinations = Number.isInteger(cfg.searchMaxDestinations) ? cfg.searchMaxDestinations : 3;
    state.searchCooldownSeconds = Number.isInteger(cfg.searchCooldownSeconds) ? cfg.searchCooldownSeconds : 120;
    state.searchCacheTtlSeconds = Number.isInteger(cfg.searchCacheTtlSeconds) ? cfg.searchCacheTtlSeconds : 300;
    state.searchDateRangeDays = Number.isInteger(cfg.searchDateRangeDays) ? cfg.searchDateRangeDays : 7;
    state.searchAllowedOrigins = Array.isArray(cfg.searchAllowedOrigins) && cfg.searchAllowedOrigins.length > 0
      ? cfg.searchAllowedOrigins.map((value) => upper(value)).filter(Boolean)
      : ["DXB"];

    const key = String(cfg.posthogKey || "").trim();
    if (key) {
      analytics.key = key;
      analytics.host = String(cfg.posthogHost || "https://us.i.posthog.com").trim() || "https://us.i.posthog.com";
      analytics.distinctId = getOrCreateDistinctId();
      analytics.enabled = true;
      trackEvent("search_page_view", {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown"
      });
    }

    await loadAirports();

    renderOriginOptions();
    renderDateBounds();
    renderChips();
    setupEvents();

    if (!state.searchEnabled) {
      setSubmitting(true);
      setStatus("Search is disabled", "bad");
      return;
    }

    setStatus(`Live queries: max ${state.searchMaxDestinations} destinations per request`, "muted");
  } catch (err) {
    setSubmitting(true);
    setStatus(`Failed to initialize search page: ${err.message}`, "bad");
  }
}

init();
