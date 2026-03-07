const USD_TO_AED = 3.6725;
const CURRENCY_STORAGE_KEY = "evac_display_currency";

const state = {
  searchEnabled: true,
  searchMaxDestinations: 3,
  searchCooldownSeconds: 30,
  searchCacheTtlSeconds: 300,
  searchDateRangeDays: 7,
  searchAllowedOrigins: ["DXB", "MCT", "AUH", "SHJ"],
  airports: [],
  airportsByIata: new Map(),
  selectedDestinations: [],
  isSubmitting: false,
  displayCurrency: "USD",
  lastPayload: null
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
  destInputWrap: document.querySelector("#destInputWrap"),
  resultsSection: document.querySelector("#resultsSection"),
  resultSummary: document.querySelector("#resultSummary"),
  resultErrors: document.querySelector("#resultErrors"),
  resultGroups: document.querySelector("#resultGroups"),
  currencyToggle: document.querySelector("#currencyToggle")
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

function normalizeDisplayCurrency(text) {
  return text === "AED" ? "AED" : "USD";
}

function getSavedCurrency() {
  try {
    return normalizeDisplayCurrency(window.localStorage.getItem(CURRENCY_STORAGE_KEY) || "USD");
  } catch {
    return "USD";
  }
}

function saveCurrency(currency) {
  try {
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch {}
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

const ORIGIN_CITY_NAMES = {
  DXB: "Dubai",
  AUH: "Abu Dhabi",
  SHJ: "Sharjah",
  MCT: "Muscat"
};

function originDisplayName(iata) {
  const city = ORIGIN_CITY_NAMES[iata] || state.airportsByIata.get(iata)?.city;
  if (city) return `${city} (${iata})`;
  return iata;
}

function renderOriginOptions() {
  const origins = (Array.isArray(state.searchAllowedOrigins) && state.searchAllowedOrigins.length > 0)
    ? state.searchAllowedOrigins
    : ["DXB"];

  els.originSelect.innerHTML = origins
    .map((origin) => `<option value="${escapeHtml(origin)}">${escapeHtml(originDisplayName(origin))}</option>`)
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

function fmtTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

function fmtDateShort(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(d);
}

function convertPrice(amount, sourceCurrency, targetCurrency) {
  const parsed = Number.parseFloat(String(amount || ""));
  if (!Number.isFinite(parsed)) return { amount: 0, currency: targetCurrency };

  const src = String(sourceCurrency || "USD").trim().toUpperCase();
  const tgt = String(targetCurrency || "USD").trim().toUpperCase();

  if (src === tgt) return { amount: parsed, currency: tgt };
  if (src === "USD" && tgt === "AED") return { amount: parsed * USD_TO_AED, currency: "AED" };
  if (src === "AED" && tgt === "USD") return { amount: parsed / USD_TO_AED, currency: "USD" };
  return { amount: parsed, currency: src };
}

function fmtPrice(amount, sourceCurrency) {
  const { amount: converted, currency } = convertPrice(amount, sourceCurrency, state.displayCurrency);
  if (converted === 0) return "-";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(converted);
  } catch {
    return `${currency} ${Math.round(converted)}`;
  }
}

function stopsLabel(count) {
  if (count === 0) return "Nonstop";
  if (count === 1) return "1 stop";
  return `${count} stops`;
}

function fmtDuration(minutes) {
  if (!minutes || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtLayover(layovers) {
  if (!Array.isArray(layovers) || layovers.length === 0) return "";
  return layovers.map((l) => {
    const dur = fmtDuration(l.durationMinutes);
    const city = l.city || l.airport || "";
    return dur ? `${dur} ${city}` : city;
  }).join(", ");
}

function buildBookingPillsHtml(links) {
  const pills = [];

  if (links.google) {
    pills.push(`<a class="booking-pill pill-google" href="${escapeHtml(links.google)}" target="_blank" rel="noopener noreferrer" title="Google Flights">Google</a>`);
  }
  if (links.skyscanner) {
    pills.push(`<a class="booking-pill pill-skyscanner" href="${escapeHtml(links.skyscanner)}" target="_blank" rel="noopener noreferrer" title="Skyscanner">Skyscanner</a>`);
  }
  if (links.kayak) {
    pills.push(`<a class="booking-pill pill-kayak" href="${escapeHtml(links.kayak)}" target="_blank" rel="noopener noreferrer" title="Kayak">Kayak</a>`);
  }

  if (pills.length === 0) return "";
  return `<div class="booking-pills">${pills.join("")}</div>`;
}

function updateCurrencyButtons() {
  if (!els.currencyToggle) return;
  for (const btn of els.currencyToggle.querySelectorAll(".currency-btn")) {
    const curr = normalizeDisplayCurrency(btn.getAttribute("data-currency"));
    btn.classList.toggle("active", curr === state.displayCurrency);
  }
}

function renderResults(payload) {
  els.resultsSection.hidden = false;

  // Human-friendly summary
  const totalFlights = (payload.flightsFound || payload.offersFound || 0);
  const destCount = (Array.isArray(payload.results) ? payload.results : []).length;
  const originLabel = escapeHtml(payload.origin || "");
  const dateLabel = escapeHtml(fmtDateShort(payload.departureDate + "T12:00:00") || payload.departureDate);

  if (totalFlights > 0) {
    els.resultSummary.innerHTML = `${totalFlights} flight${totalFlights === 1 ? "" : "s"} found from <strong>${originLabel}</strong> on ${dateLabel}` +
      (destCount > 1 ? ` across ${destCount} destinations` : "");
  } else {
    els.resultSummary.innerHTML = `No flights found from <strong>${originLabel}</strong> on ${dateLabel}`;
  }

  // Errors
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  if (errors.length > 0) {
    els.resultErrors.hidden = false;
    els.resultErrors.innerHTML = errors
      .map((entry) => `Could not check <strong>${escapeHtml(entry.destinationIata || "")}</strong>: ${escapeHtml(entry.error || "unavailable")}`)
      .join("<br />");
  } else {
    els.resultErrors.hidden = true;
    els.resultErrors.innerHTML = "";
  }

  // Flight groups
  const groups = Array.isArray(payload.results) ? payload.results : [];
  if (groups.length === 0 && errors.length === 0) {
    els.resultGroups.innerHTML = `<section class="result-group"><p class="no-flights">No flights found for selected destinations and date.</p></section>`;
    return;
  }

  els.resultGroups.innerHTML = groups.map((group) => {
    const flights = Array.isArray(group.flights) ? group.flights : (Array.isArray(group.offers) ? group.offers : []);

    if (flights.length === 0) {
      return `
        <section class="result-group">
          <div class="group-head">
            <h2 class="group-title">${escapeHtml(group.destinationIata)} · ${escapeHtml(group.destinationName || group.destinationIata)}</h2>
          </div>
          <p class="no-flights">No flights available</p>
        </section>
      `;
    }

    const flightsHtml = flights.map((f) => {
      const flightCode = `${f.carrierCode || ""}${f.flightNumber || ""}`.trim();
      const depTime = fmtTime(f.departAt);
      const arrTime = fmtTime(f.arriveAt);
      const depDate = fmtDateShort(f.departAt);
      const arrDate = fmtDateShort(f.arriveAt);
      const crossDay = depDate && arrDate && depDate !== arrDate;
      const stops = Number(f.stops ?? 0);
      const stopsUnknown = f.stops === -1 || f.stops === undefined;
      const stopsText = stopsUnknown ? "" : stopsLabel(stops);
      const layoverText = stopsUnknown ? "" : fmtLayover(f.layovers);
      const stopsDisplay = layoverText ? `${stopsText} · ${layoverText}` : stopsText;
      const stopsClass = stops === 0 && !stopsUnknown ? "flight-stops nonstop" : "flight-stops";

      const source = f.source || "duffel";
      const isFr24Only = source === "fr24";
      const isBoth = source === "both";
      const hasPrice = f.priceAmount && Number.parseFloat(f.priceAmount) > 0;
      const price = hasPrice ? fmtPrice(f.priceAmount, f.priceCurrency) : "";

      // Booking links (needed for both pills and "check price" badge)
      const links = f.bookingLinks || {};
      const pillsHtml = buildBookingPillsHtml(links);

      // Airline booking URL for CTA
      const airlineUrl = links.airline || f.bookingUrl || "";

      // Price or "check price" link for FR24-only flights
      const checkPriceUrl = isFr24Only ? (airlineUrl || links.google || "") : "";
      const priceHtml = isFr24Only
        ? (checkPriceUrl
            ? `<a class="flight-badge flight-badge-schedule" href="${escapeHtml(checkPriceUrl)}" target="_blank" rel="noopener noreferrer">Check price ↗</a>`
            : `<span class="flight-badge flight-badge-schedule">Check price ↗</span>`)
        : (price ? `<div class="flight-price">${escapeHtml(price)}</div>` : "");

      // "Book" CTA below price (only for priced Duffel flights with an airline URL)
      const bookCta = (!isFr24Only && airlineUrl && hasPrice)
        ? `<a class="flight-book" href="${escapeHtml(airlineUrl)}" target="_blank" rel="noopener noreferrer">Book →</a>`
        : "";

      // FR24 verified badge
      const verifiedBadge = isBoth
        ? ` <span class="flight-badge flight-badge-verified" title="Confirmed in FR24 schedule">✓ FR24</span>`
        : "";

      // Arrival display — hide arrow if no arrival time (FR24-only)
      const arrHtml = arrTime
        ? `<span class="flight-arrow">→</span><span>${escapeHtml(arrTime)}${crossDay ? `<sup>+1</sup>` : ""}</span>`
        : "";

      return `
        <article class="flight${isFr24Only ? " flight-schedule" : ""}">
          <div class="flight-info">
            <div class="flight-airline">${escapeHtml(f.airline || "Unknown")}${flightCode ? ` <span class="flight-code">${escapeHtml(flightCode)}</span>` : ""}${verifiedBadge}</div>
            <div class="flight-times">
              <span>${escapeHtml(depTime || "-")}</span>
              ${arrHtml}
              ${stopsDisplay ? `<span class="${stopsClass}">${escapeHtml(stopsDisplay)}</span>` : ""}
            </div>
          </div>
          <div class="flight-right">
            ${priceHtml}
            ${bookCta}
          </div>
          ${pillsHtml}
        </article>
      `;
    }).join("");

    return `
      <section class="result-group">
        <div class="group-head">
          <h2 class="group-title">${escapeHtml(group.destinationIata)} · ${escapeHtml(group.destinationName || group.destinationIata)}</h2>
          <span class="group-sub">${flights.length} flight${flights.length === 1 ? "" : "s"}</span>
        </div>
        <div class="flight-list">${flightsHtml}</div>
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

  // Clear stale results immediately so the user doesn't see the old search
  els.resultsSection.hidden = true;
  els.resultGroups.innerHTML = "";
  els.resultErrors.hidden = true;
  els.resultErrors.innerHTML = "";

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

    state.lastPayload = data;
    renderResults(data);
    setStatus("");

    trackEvent("search_result", {
      source: data.source,
      pairs_checked: data.pairsChecked,
      flights_found: data.flightsFound || data.offersFound || 0,
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

function setupCurrencyToggle() {
  if (!els.currencyToggle) return;
  for (const btn of els.currencyToggle.querySelectorAll(".currency-btn")) {
    btn.addEventListener("click", () => {
      const next = normalizeDisplayCurrency(btn.getAttribute("data-currency"));
      if (next === state.displayCurrency) return;
      state.displayCurrency = next;
      saveCurrency(next);
      updateCurrencyButtons();
      if (state.lastPayload) {
        renderResults(state.lastPayload);
      }
      trackEvent("search_currency_toggled", { currency: next });
    });
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

  // Click anywhere in the tag-input wrapper to focus the text input
  if (els.destInputWrap) {
    els.destInputWrap.addEventListener("click", (event) => {
      if (event.target === els.destinationInput) return;
      if (event.target.closest("button")) return; // don't steal chip remove clicks
      els.destinationInput.focus();
    });
  }

  setupCurrencyToggle();
}

async function init() {
  try {
    const cfg = await loadPublicConfig();
    state.searchEnabled = Boolean(cfg.searchEnabled);
    state.searchMaxDestinations = Number.isInteger(cfg.searchMaxDestinations) ? cfg.searchMaxDestinations : 3;
    state.searchCooldownSeconds = Number.isInteger(cfg.searchCooldownSeconds) ? cfg.searchCooldownSeconds : 30;
    state.searchCacheTtlSeconds = Number.isInteger(cfg.searchCacheTtlSeconds) ? cfg.searchCacheTtlSeconds : 300;
    state.searchDateRangeDays = Number.isInteger(cfg.searchDateRangeDays) ? cfg.searchDateRangeDays : 7;
    state.searchAllowedOrigins = Array.isArray(cfg.searchAllowedOrigins) && cfg.searchAllowedOrigins.length > 0
      ? cfg.searchAllowedOrigins.map((value) => upper(value)).filter(Boolean)
      : ["DXB"];

    state.displayCurrency = getSavedCurrency();

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
    updateCurrencyButtons();
    setupEvents();

    if (!state.searchEnabled) {
      setSubmitting(true);
      setStatus("Search is disabled", "bad");
      return;
    }

    setStatus("");
  } catch (err) {
    setSubmitting(true);
    setStatus(`Failed to initialize search page: ${err.message}`, "bad");
  }
}

init();
