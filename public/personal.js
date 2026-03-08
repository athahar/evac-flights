// ── Personal Travel Search V0 — Hawaii Vacation ─────────────────────

const AIRPORTS = {
  bay: [
    { iata: "SFO", name: "San Francisco" },
    { iata: "OAK", name: "Oakland" },
    { iata: "SJC", name: "San Jose" }
  ],
  hawaii: [
    { iata: "HNL", name: "Honolulu (Oahu)" },
    { iata: "OGG", name: "Kahului (Maui)" },
    { iata: "LIH", name: "Lihue (Kauai)" },
    { iata: "KOA", name: "Kona (Big Island)" },
    { iata: "ITO", name: "Hilo (Big Island)" }
  ]
};

const ALL_AIRPORTS = [...AIRPORTS.bay, ...AIRPORTS.hawaii];

const state = {
  activeTab: "flights",
  tripType: "one_way",
  flightResults: [],
  staysResults: [],
  flightFilters: {
    stops: "any",
    airlines: new Set(),
    sort: "price"
  },
  staysFilters: {
    sort: "price_asc",
    stars: 0,
    freeCancellation: false
  }
};

// ── Init ──────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initAirportCheckboxes();
  initDates();
  setupEvents();
});

function initAirportCheckboxes() {
  const fromEl = document.getElementById("from-airports");
  const toEl = document.getElementById("to-airports");

  for (const ap of ALL_AIRPORTS) {
    fromEl.appendChild(makeCheckbox("from", ap));
    toEl.appendChild(makeCheckbox("to", ap));
  }

  // Default: all Bay Area as origin, all Hawaii as destination
  for (const ap of AIRPORTS.bay) {
    const cb = document.querySelector(`input[data-dir="from"][value="${ap.iata}"]`);
    if (cb) cb.checked = true;
  }
  for (const ap of AIRPORTS.hawaii) {
    const cb = document.querySelector(`input[data-dir="to"][value="${ap.iata}"]`);
    if (cb) cb.checked = true;
  }
}

function makeCheckbox(dir, ap) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = ap.iata;
  input.dataset.dir = dir;
  input.dataset.group = AIRPORTS.bay.some((b) => b.iata === ap.iata) ? "bay" : "hawaii";
  label.appendChild(input);
  label.appendChild(document.createTextNode(` ${ap.iata} · ${ap.name}`));
  return label;
}

function initDates() {
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const dep = new Date(today.getTime() + 7 * 86400000);
  const ret = new Date(today.getTime() + 14 * 86400000);

  document.getElementById("depart-date").value = fmt(dep);
  document.getElementById("return-date").value = fmt(ret);
  document.getElementById("checkin-date").value = fmt(dep);
  document.getElementById("checkout-date").value = fmt(ret);
}

// ── Events ────────────────────────────────────────────────────────────

function setupEvents() {
  // Tab switching
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Trip type toggle
  document.querySelectorAll(".trip-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".trip-toggle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.tripType = btn.dataset.trip;
      document.getElementById("return-field").style.display =
        state.tripType === "round_trip" ? "" : "none";
    });
  });

  // Group toggles
  document.querySelectorAll(".group-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.dataset.group; // "from-bay", "from-hawaii", "to-bay", "to-hawaii"
      const [dir, region] = group.split("-");
      const boxes = document.querySelectorAll(`input[data-dir="${dir}"][data-group="${region}"]`);
      const allChecked = [...boxes].every((cb) => cb.checked);
      boxes.forEach((cb) => { cb.checked = !allChecked; });
    });
  });

  // Search buttons
  document.getElementById("search-flights-btn").addEventListener("click", searchFlights);
  document.getElementById("search-stays-btn").addEventListener("click", searchStaysAction);
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".form-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `panel-${tab}`);
  });

  // Clear results when switching
  showStatus("");
  document.getElementById("results-count").textContent = "";
  document.getElementById("results-list").innerHTML = "";
  document.getElementById("filters-panel").classList.remove("active");
}

// ── Flight search ─────────────────────────────────────────────────────

async function searchFlights() {
  const origins = getChecked("from");
  const destinations = getChecked("to");

  if (origins.length === 0) return showStatus("Select at least one origin airport", "error");
  if (destinations.length === 0) return showStatus("Select at least one destination airport", "error");

  const departureDate = document.getElementById("depart-date").value;
  if (!departureDate) return showStatus("Select a departure date", "error");

  const returnDate = state.tripType === "round_trip"
    ? document.getElementById("return-date").value
    : null;

  if (state.tripType === "round_trip" && !returnDate) {
    return showStatus("Select a return date", "error");
  }

  const payload = {
    origins,
    destinations,
    tripType: state.tripType,
    departureDate,
    returnDate,
    adults: parseInt(document.getElementById("adults").value),
    children: parseInt(document.getElementById("children").value),
    cabinClass: document.getElementById("cabin-class").value
  };

  const pairs = origins.length * destinations.filter((d) => !origins.includes(d)).length;
  showStatus(`Searching ${pairs} route${pairs > 1 ? "s" : ""}... This may take a moment.`, "loading");
  disableBtn("search-flights-btn", true);

  try {
    const res = await fetch("/api/personal/flights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Search failed");

    state.flightResults = data.offers || [];
    state.flightFilters.airlines = new Set();

    const sec = (data.durationMs / 1000).toFixed(1);
    const errCount = (data.errors || []).length;
    const msg = `Found ${state.flightResults.length} flights across ${data.pairsSearched} routes in ${sec}s${errCount > 0 ? ` (${errCount} errors)` : ""}`;
    showStatus(msg, "info");

    buildFlightFilters();
    renderFlights();
  } catch (err) {
    showStatus(err.message, "error");
  } finally {
    disableBtn("search-flights-btn", false);
  }
}

// ── Stays search ──────────────────────────────────────────────────────

async function searchStaysAction() {
  const location = document.getElementById("stay-location").value;
  const checkInDate = document.getElementById("checkin-date").value;
  const checkOutDate = document.getElementById("checkout-date").value;

  if (!checkInDate || !checkOutDate) return showStatus("Select check-in and check-out dates", "error");

  const payload = {
    location,
    checkInDate,
    checkOutDate,
    rooms: parseInt(document.getElementById("stay-rooms").value),
    adults: parseInt(document.getElementById("stay-adults").value),
    children: parseInt(document.getElementById("stay-children").value)
  };

  showStatus(`Searching stays in ${location}...`, "loading");
  disableBtn("search-stays-btn", true);

  try {
    const res = await fetch("/api/personal/stays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Search failed");

    state.staysResults = data.results || [];
    const sec = (data.durationMs / 1000).toFixed(1);
    showStatus(`Found ${state.staysResults.length} accommodations in ${data.location} in ${sec}s`, "info");

    buildStaysFilters();
    renderStays();
  } catch (err) {
    showStatus(err.message, "error");
  } finally {
    disableBtn("search-stays-btn", false);
  }
}

// ── Flight filters & rendering ────────────────────────────────────────

function buildFlightFilters() {
  const airlines = new Set();
  for (const f of state.flightResults) {
    if (f.airline) airlines.add(f.airline);
  }

  const filtersEl = document.getElementById("filters-panel");
  filtersEl.innerHTML = `
    <h3>Filters</h3>
    <div class="filter-group filter-sort">
      <label>Sort by</label>
      <select id="filter-sort">
        <option value="price">Price (low→high)</option>
        <option value="duration">Duration (short→long)</option>
        <option value="departure">Departure (early→late)</option>
      </select>
    </div>
    <div class="filter-group">
      <label>Stops</label>
      <div class="options">
        <label><input type="radio" name="stops" value="any" checked /> Any</label>
        <label><input type="radio" name="stops" value="0" /> Nonstop</label>
        <label><input type="radio" name="stops" value="1" /> 1 stop</label>
        <label><input type="radio" name="stops" value="2" /> 2+ stops</label>
      </div>
    </div>
    <div class="filter-group">
      <label>Airlines</label>
      <div class="options" id="airline-filters">
        ${[...airlines].sort().map((a) => `<label><input type="checkbox" value="${esc(a)}" checked /> ${esc(a)}</label>`).join("")}
      </div>
    </div>
  `;
  filtersEl.classList.add("active");

  // Filter event listeners
  filtersEl.querySelector("#filter-sort").addEventListener("change", (e) => {
    state.flightFilters.sort = e.target.value;
    renderFlights();
  });

  filtersEl.querySelectorAll("input[name='stops']").forEach((radio) => {
    radio.addEventListener("change", (e) => {
      state.flightFilters.stops = e.target.value;
      renderFlights();
    });
  });

  filtersEl.querySelectorAll("#airline-filters input").forEach((cb) => {
    cb.addEventListener("change", () => renderFlights());
  });
}

function getActiveAirlines() {
  const boxes = document.querySelectorAll("#airline-filters input:checked");
  return new Set([...boxes].map((cb) => cb.value));
}

function filterAndSortFlights() {
  let flights = [...state.flightResults];
  const { stops, sort } = state.flightFilters;
  const activeAirlines = getActiveAirlines();

  // Filter by stops
  if (stops !== "any") {
    const num = parseInt(stops);
    if (num === 2) {
      flights = flights.filter((f) => f.stops >= 2);
    } else {
      flights = flights.filter((f) => f.stops === num);
    }
  }

  // Filter by airlines
  if (activeAirlines.size > 0) {
    flights = flights.filter((f) => activeAirlines.has(f.airline));
  }

  // Sort
  if (sort === "price") {
    flights.sort((a, b) => parsePrice(a) - parsePrice(b));
  } else if (sort === "duration") {
    flights.sort((a, b) => (a.totalDurationMinutes || 9999) - (b.totalDurationMinutes || 9999));
  } else if (sort === "departure") {
    flights.sort((a, b) => (a.departAt || "").localeCompare(b.departAt || ""));
  }

  return flights;
}

function renderFlights() {
  const flights = filterAndSortFlights();
  document.getElementById("results-count").textContent =
    `${flights.length} of ${state.flightResults.length} flights`;

  const listEl = document.getElementById("results-list");
  if (flights.length === 0) {
    listEl.innerHTML = '<p style="color:var(--muted)">No flights match your filters.</p>';
    return;
  }

  listEl.innerHTML = flights.map(flightCardHtml).join("");
}

function flightCardHtml(f) {
  const depTime = fmtTime(f.departAt);
  const arrTime = fmtTime(f.arriveAt);
  const duration = fmtDuration(f.totalDurationMinutes);
  const stopsLabel = f.stops === 0 ? "Nonstop" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`;
  const stopsClass = f.stops > 0 ? "has-stops" : "";
  const layovers = (f.layovers || []).map((l) => l.airport).join(", ");
  const price = fmtPrice(f.priceAmount, f.priceCurrency);

  let returnHtml = "";
  if (f.returnFlight) {
    const r = f.returnFlight;
    const rDepTime = fmtTime(r.departAt);
    const rArrTime = fmtTime(r.arriveAt);
    const rStops = r.stops === 0 ? "Nonstop" : `${r.stops} stop${r.stops > 1 ? "s" : ""}`;
    const rLayovers = (r.layovers || []).map((l) => l.airport).join(", ");
    returnHtml = `
      <div class="fc-return">
        <div class="fc-label">Return</div>
        <div class="fc-times">
          <span class="fc-time">${rDepTime}</span>
          <div class="fc-route-line">
            <div class="fc-stops-label ${r.stops > 0 ? "has-stops" : ""}">${rStops}</div>
            ${rLayovers ? `<div class="fc-layovers">${esc(rLayovers)}</div>` : ""}
          </div>
          <span class="fc-time">${rArrTime}</span>
        </div>
        <div style="width:80px;text-align:center;font-size:0.75rem;color:var(--muted)">${esc(r.origin)} → ${esc(r.destination)}</div>
      </div>
    `;
  }

  const pills = buildPills(f.bookingLinks);

  return `
    <div class="flight-card">
      <div class="fc-main">
        <div class="fc-airline">
          <div class="fc-airline-name">${esc(f.airline)}</div>
          <div class="fc-airline-code">${esc(f.carrierCode)}${f.flightNumber ? esc(f.flightNumber) : ""}</div>
        </div>
        <div class="fc-times">
          <span class="fc-time">${depTime}</span>
          <div class="fc-route-line">
            <div class="fc-duration">${duration}</div>
            <div class="fc-stops-label ${stopsClass}">${stopsLabel}</div>
            ${layovers ? `<div class="fc-layovers">${esc(layovers)}</div>` : ""}
          </div>
          <span class="fc-time">${arrTime}</span>
        </div>
        <div class="fc-price">
          <div class="fc-price-amount">${price}</div>
          <div class="fc-price-currency">${esc(f.priceCurrency)}</div>
          <div style="font-size:0.68rem;color:var(--muted)">${esc(f.origin)} → ${esc(f.destination)}</div>
        </div>
      </div>
      ${returnHtml}
      <div class="fc-actions">${pills}</div>
    </div>
  `;
}

function buildPills(links) {
  if (!links) return "";
  const pills = [];
  if (links.google) pills.push(`<a class="booking-pill pill-google" href="${esc(links.google)}" target="_blank" rel="noopener">Google</a>`);
  if (links.skyscanner) pills.push(`<a class="booking-pill pill-skyscanner" href="${esc(links.skyscanner)}" target="_blank" rel="noopener">Skyscanner</a>`);
  if (links.kayak) pills.push(`<a class="booking-pill pill-kayak" href="${esc(links.kayak)}" target="_blank" rel="noopener">Kayak</a>`);
  if (links.airline) pills.push(`<a class="booking-pill pill-airline" href="${esc(links.airline)}" target="_blank" rel="noopener">Airline</a>`);
  return pills.join("");
}

// ── Stays filters & rendering ─────────────────────────────────────────

function buildStaysFilters() {
  const filtersEl = document.getElementById("filters-panel");
  filtersEl.innerHTML = `
    <h3>Filters</h3>
    <div class="filter-group filter-sort">
      <label>Sort by</label>
      <select id="filter-stays-sort">
        <option value="price_asc">Price (low→high)</option>
        <option value="price_desc">Price (high→low)</option>
        <option value="rating">Rating (best→worst)</option>
      </select>
    </div>
    <div class="filter-group">
      <label>Min stars</label>
      <select id="filter-stars">
        <option value="0">Any</option>
        <option value="3">3+</option>
        <option value="4">4+</option>
        <option value="5">5</option>
      </select>
    </div>
    <div class="filter-group">
      <label><input type="checkbox" id="filter-free-cancel" /> Free cancellation only</label>
    </div>
  `;
  filtersEl.classList.add("active");

  filtersEl.querySelector("#filter-stays-sort").addEventListener("change", (e) => {
    state.staysFilters.sort = e.target.value;
    renderStays();
  });

  filtersEl.querySelector("#filter-stars").addEventListener("change", (e) => {
    state.staysFilters.stars = parseInt(e.target.value);
    renderStays();
  });

  filtersEl.querySelector("#filter-free-cancel").addEventListener("change", (e) => {
    state.staysFilters.freeCancellation = e.target.checked;
    renderStays();
  });
}

function filterAndSortStays() {
  let stays = [...state.staysResults];
  const { sort, stars, freeCancellation } = state.staysFilters;

  // Filter by stars
  if (stars > 0) {
    stays = stays.filter((s) => (s.accommodation?.rating || 0) >= stars);
  }

  // Filter free cancellation
  if (freeCancellation) {
    stays = stays.filter((s) => {
      const rooms = s.rooms || [];
      return rooms.some((r) => {
        const rates = r.rates || [];
        return rates.some((rate) => rate.cancellation_timeline?.some((t) => t.refundable));
      });
    });
  }

  // Sort
  if (sort === "price_asc") {
    stays.sort((a, b) => getCheapestPrice(a) - getCheapestPrice(b));
  } else if (sort === "price_desc") {
    stays.sort((a, b) => getCheapestPrice(b) - getCheapestPrice(a));
  } else if (sort === "rating") {
    stays.sort((a, b) => (b.accommodation?.rating || 0) - (a.accommodation?.rating || 0));
  }

  return stays;
}

function getCheapestPrice(stay) {
  let min = Infinity;
  for (const room of (stay.rooms || [])) {
    for (const rate of (room.rates || [])) {
      const amt = parseFloat(rate.total_amount || "9999999");
      if (amt < min) min = amt;
    }
  }
  return min;
}

function getCheapestRate(stay) {
  let cheapest = null;
  let cheapestAmount = Infinity;
  for (const room of (stay.rooms || [])) {
    for (const rate of (room.rates || [])) {
      const amt = parseFloat(rate.total_amount || "9999999");
      if (amt < cheapestAmount) {
        cheapestAmount = amt;
        cheapest = { ...rate, roomName: room.name };
      }
    }
  }
  return cheapest;
}

function renderStays() {
  const stays = filterAndSortStays();
  document.getElementById("results-count").textContent =
    `${stays.length} of ${state.staysResults.length} accommodations`;

  const listEl = document.getElementById("results-list");
  if (stays.length === 0) {
    listEl.innerHTML = '<p style="color:var(--muted)">No stays match your filters.</p>';
    return;
  }

  listEl.innerHTML = stays.map(stayCardHtml).join("");
}

function stayCardHtml(stay) {
  const acc = stay.accommodation || {};
  const name = acc.name || "Unknown";
  const rating = acc.rating || 0;
  const stars = "★".repeat(Math.round(rating));
  const photos = acc.photos || [];
  const photoUrl = photos[0]?.url || "";
  const location = acc.location?.address?.city_name || "";

  const cheapest = getCheapestRate(stay);
  const price = cheapest ? fmtPrice(cheapest.total_amount, cheapest.total_currency) : "N/A";
  const currency = cheapest?.total_currency || "";
  const boardType = cheapest?.board_type || "";

  const freeCancelBadge = cheapest?.cancellation_timeline?.some((t) => t.refundable)
    ? '<span class="stay-badge">Free cancellation</span>'
    : "";

  const boardBadge = boardType
    ? `<span class="stay-badge board">${esc(boardType.replace(/_/g, " "))}</span>`
    : "";

  return `
    <div class="stay-card">
      ${photoUrl ? `<img class="stay-photo" src="${esc(photoUrl)}" alt="${esc(name)}" loading="lazy" />` : '<div class="stay-photo"></div>'}
      <div class="stay-info">
        <h4 class="stay-name">${esc(name)}</h4>
        <div class="stay-meta">
          ${stars ? `<span class="stay-stars">${stars}</span>` : ""}
          ${location ? `<span class="stay-area">${esc(location)}</span>` : ""}
        </div>
        <div class="stay-badges">
          ${freeCancelBadge}
          ${boardBadge}
          ${cheapest?.roomName ? `<span class="stay-badge">${esc(cheapest.roomName)}</span>` : ""}
        </div>
      </div>
      <div class="stay-pricing">
        <div class="stay-price">${price}</div>
        <div class="stay-per-night">${currency} total</div>
      </div>
    </div>
  `;
}

// ── Helpers ───────────────────────────────────────────────────────────

function getChecked(dir) {
  return [...document.querySelectorAll(`input[data-dir="${dir}"]:checked`)].map((cb) => cb.value);
}

function disableBtn(id, disabled) {
  const btn = document.getElementById(id);
  if (btn) btn.disabled = disabled;
}

function showStatus(msg, type = "") {
  const el = document.getElementById("status");
  el.className = "status-bar";
  if (type) el.classList.add(type);
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

function fmtTime(iso) {
  if (!iso) return "--:--";
  const match = String(iso).match(/T(\d{2}):(\d{2})/);
  if (!match) return "--:--";
  const h = parseInt(match[1]);
  const m = match[2];
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${ampm}`;
}

function fmtDuration(minutes) {
  if (!minutes || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtPrice(amount, currency) {
  const num = parseFloat(amount);
  if (!isFinite(num)) return "N/A";
  const c = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(num);
  } catch {
    return `${c} ${num.toFixed(2)}`;
  }
}

function parsePrice(f) {
  return parseFloat(f.priceAmount) || Infinity;
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = String(str || "");
  return div.innerHTML;
}
