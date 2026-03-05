function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function pushIfValue(arr, value) {
  const parsed = upper(value);
  if (parsed) arr.push(parsed);
}

function getStopAirports(segment) {
  const stops = Array.isArray(segment.stops) ? segment.stops : [];
  return stops
    .map((stop) => stop?.airport?.iata_code || stop?.iata_code)
    .map((code) => upper(code))
    .filter(Boolean);
}

function getStopCountries(segment) {
  const stops = Array.isArray(segment.stops) ? segment.stops : [];
  return stops
    .map((stop) => stop?.airport?.iata_country_code || stop?.iata_country_code)
    .map((code) => upper(code))
    .filter(Boolean);
}

export function flattenOfferAirportsAndCountries(offer) {
  const segments = (offer?.slices || []).flatMap((slice) => slice?.segments || []);
  const airports = [];
  const countries = [];

  for (const segment of segments) {
    pushIfValue(airports, segment?.origin?.iata_code);
    pushIfValue(countries, segment?.origin?.iata_country_code);

    for (const stopAirport of getStopAirports(segment)) {
      pushIfValue(airports, stopAirport);
    }
    for (const stopCountry of getStopCountries(segment)) {
      pushIfValue(countries, stopCountry);
    }

    pushIfValue(airports, segment?.destination?.iata_code);
    pushIfValue(countries, segment?.destination?.iata_country_code);
  }

  return { airports, countries, segments };
}

export function getRouteEndpoints(offer) {
  const segments = (offer?.slices || []).flatMap((slice) => slice?.segments || []);
  if (segments.length === 0) {
    return { origin: "", destination: "" };
  }

  return {
    origin: upper(segments[0]?.origin?.iata_code),
    destination: upper(segments[segments.length - 1]?.destination?.iata_code)
  };
}

export function isOfferAllowed(offer, blocklist) {
  const blockedAirports = new Set((blocklist?.airports || []).map(upper));
  const blockedCountries = new Set((blocklist?.countries || []).map(upper));

  const { airports, countries } = flattenOfferAirportsAndCountries(offer);
  if (airports.length < 2) {
    return { allowed: false, reason: "missing_route_data" };
  }

  const firstOrigin = airports[0];
  const finalDestination = airports[airports.length - 1];

  if (blockedAirports.has(finalDestination)) {
    return { allowed: false, reason: "destination_in_blocked_airports" };
  }

  const finalDestinationCountry = countries[countries.length - 1] || "";
  if (finalDestinationCountry && blockedCountries.has(finalDestinationCountry)) {
    return { allowed: false, reason: "destination_in_blocked_countries" };
  }

  const transitAirports = airports.slice(1, -1);
  const blockedTransitAirport = transitAirports.find((airport) => blockedAirports.has(airport));
  if (blockedTransitAirport) {
    return { allowed: false, reason: `blocked_transit_airport:${blockedTransitAirport}` };
  }

  const transitCountries = countries.slice(1, -1);
  const blockedTransitCountry = transitCountries.find((country) => blockedCountries.has(country));
  if (blockedTransitCountry) {
    return { allowed: false, reason: `blocked_transit_country:${blockedTransitCountry}` };
  }

  if (!firstOrigin || !finalDestination) {
    return { allowed: false, reason: "invalid_route_endpoints" };
  }

  return { allowed: true, reason: "ok" };
}
