import fs from "node:fs";
import path from "node:path";

let airlines = [];
let airlinesByIata = new Map();
let airlinesByName = new Map();

function normalizeCarrierCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeDate(value) {
  return String(value || "").trim().slice(0, 10);
}

function normalizeUrl(value) {
  const text = String(value || "").trim();
  return /^https?:\/\//i.test(text) ? text : "";
}

function replaceTemplateVars(template, { from, to, date }) {
  return String(template || "")
    .replaceAll("{FROM}", from)
    .replaceAll("{TO}", to)
    .replaceAll("{DATE}", date);
}

function hasVerifyWarning(notes) {
  return /\bverify\b/i.test(String(notes || ""));
}

function getEntryByIata(iata) {
  const code = normalizeCarrierCode(iata);
  if (!code) return null;
  return airlinesByIata.get(code) || null;
}

function getEntryByExactName(name) {
  const key = normalizeName(name);
  if (!key) return null;
  return airlinesByName.get(key) || null;
}

export function loadAirlineDirectory(filePath) {
  airlines = [];
  airlinesByIata = new Map();
  airlinesByName = new Map();

  if (!filePath) return;

  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    console.warn(`[airline-links] file not found: ${resolved}`);
    return;
  }

  try {
    const raw = fs.readFileSync(resolved, "utf-8");
    const parsed = JSON.parse(raw);
    let list = Array.isArray(parsed?.airlines) ? parsed.airlines : Array.isArray(parsed) ? parsed : [];
    const isLegacyMap = !list.length && parsed && typeof parsed === "object" && !Array.isArray(parsed);

    // Backward compatibility: legacy map format { "EK": "https://..." }.
    // This keeps existing .env AIRLINE_WEBSITES_FILE deployments working.
    if (isLegacyMap) {
      const entries = Object.entries(parsed).filter(([k, v]) => typeof v === "string" && normalizeUrl(v));
      list = entries.map(([iata, url]) => ({
        name: String(iata).toUpperCase(),
        iata: String(iata).toUpperCase(),
        booking_url: url,
        deeplink_template: "",
        notes: ""
      }));
    }

    // If legacy map is configured, merge with canonical full directory so the board still
    // has links for all airlines while keeping map entries as explicit overrides.
    if (isLegacyMap) {
      const canonicalPath = path.resolve(process.cwd(), "./data/airlines.json");
      if (fs.existsSync(canonicalPath)) {
        try {
          const canonicalRaw = fs.readFileSync(canonicalPath, "utf-8");
          const canonicalParsed = JSON.parse(canonicalRaw);
          const canonicalList = Array.isArray(canonicalParsed?.airlines)
            ? canonicalParsed.airlines
            : Array.isArray(canonicalParsed)
              ? canonicalParsed
              : [];

          const overrideByIata = new Map(
            list
              .map((item) => [normalizeCarrierCode(item?.iata), item])
              .filter(([iata]) => Boolean(iata))
          );

          const merged = [...canonicalList];
          for (const [iata, overrideItem] of overrideByIata.entries()) {
            const idx = merged.findIndex((item) => normalizeCarrierCode(item?.iata) === iata);
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], ...overrideItem };
            } else {
              merged.push(overrideItem);
            }
          }
          list = merged;
        } catch (err) {
          console.warn(`[airline-links] failed loading canonical directory fallback: ${err.message}`);
        }
      }
    }

    airlines = list
      .map((item) => {
        const iata = normalizeCarrierCode(item?.iata);
        return {
          name: String(item?.name || iata || "").trim(),
          iata,
          bookingUrl: normalizeUrl(item?.booking_url || item?.website),
          deepLinkTemplate: String(item?.deeplink_template || "").trim(),
          notes: String(item?.notes || "").trim()
        };
      })
      .filter((item) => item.name || item.iata);

    for (const entry of airlines) {
      if (entry.iata) airlinesByIata.set(entry.iata, entry);
      airlinesByName.set(normalizeName(entry.name), entry);
    }
  } catch (err) {
    console.error(`[airline-links] failed loading file ${resolved}: ${err.message}`);
  }
}

export function isCargoOperator(airlineName) {
  return normalizeName(airlineName) === "my freighter";
}

export function resolveAirlineBooking({
  airlineName,
  carrierCode,
  marketingCarrierCode,
  from,
  to,
  date
}) {
  const fromCode = normalizeCarrierCode(from);
  const toCode = normalizeCarrierCode(to);
  const dateIso = normalizeDate(date);

  let entry = null;
  let matchType = "none";

  // Prefer the flight row carrier (from FR24/board row), then Duffel marketing code.
  // This keeps website links aligned with the displayed airline/flight in UI.
  for (const candidate of [carrierCode, marketingCarrierCode]) {
    entry = getEntryByIata(candidate);
    if (entry) {
      matchType = "iata";
      break;
    }
  }

  if (!entry && /^air india express\b/i.test(String(airlineName || ""))) {
    entry = getEntryByIata("IX");
    if (entry) matchType = "air_india_express_prefix";
  }

  if (!entry) {
    entry = getEntryByExactName(airlineName);
    if (entry) matchType = "name";
  }

  if (!entry) {
    return {
      matched: false,
      matchType,
      websiteMode: "dash",
      bookingUrl: "",
      bookingNeedsVerify: false
    };
  }

  const hasTemplate = Boolean(entry.deepLinkTemplate);
  const deepLink = hasTemplate ? replaceTemplateVars(entry.deepLinkTemplate, { from: fromCode, to: toCode, date: dateIso }) : "";
  const fallbackUrl = entry.bookingUrl || "";
  const finalUrl = deepLink || fallbackUrl;

  if (!finalUrl) {
    return {
      matched: true,
      matchType,
      websiteMode: "none",
      bookingUrl: "",
      bookingNeedsVerify: hasVerifyWarning(entry.notes)
    };
  }

  return {
    matched: true,
    matchType,
    websiteMode: "link",
    bookingUrl: finalUrl,
    bookingNeedsVerify: hasVerifyWarning(entry.notes)
  };
}
