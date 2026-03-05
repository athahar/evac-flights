function buildHeaders(config) {
  return {
    Authorization: `Bearer ${config.duffelToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Duffel-Version": config.duffelVersion
  };
}

function duffelLogEnabled(config) {
  return Boolean(config?.duffelLogs);
}

function duffelLog(config, message) {
  if (!duffelLogEnabled(config)) return;
  console.log(`[${new Date().toISOString()}] [duffel] ${message}`);
}

function duffelPayloadLogEnabled(config) {
  return Boolean(config?.duffelLogPayloads);
}

function duffelLogPayload(config, label, payload) {
  if (!duffelPayloadLogEnabled(config)) return;
  try {
    console.log(`[${new Date().toISOString()}] [duffel-payload] ${label}`);
    console.log(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.log(`[${new Date().toISOString()}] [duffel-payload] ${label} (failed to stringify: ${err.message})`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const requestTimestampsMs = [];
let rateLimitQueue = Promise.resolve();

async function waitForRateLimitSlot(config) {
  const limitPerMinute = Number.isInteger(config?.duffelRateLimitPerMinute)
    ? config.duffelRateLimitPerMinute
    : 50;
  const windowMs = Number.isInteger(config?.duffelRateWindowMs) ? config.duffelRateWindowMs : 60_000;

  if (limitPerMinute <= 0) return;

  const attemptAcquire = async () => {
    while (true) {
      const now = Date.now();
      while (requestTimestampsMs.length > 0 && now - requestTimestampsMs[0] >= windowMs) {
        requestTimestampsMs.shift();
      }

      if (requestTimestampsMs.length < limitPerMinute) {
        requestTimestampsMs.push(now);
        return;
      }

      const nextOpenMs = requestTimestampsMs[0] + windowMs - now + 25;
      await sleep(Math.max(25, nextOpenMs));
    }
  };

  rateLimitQueue = rateLimitQueue.then(attemptAcquire, attemptAcquire);
  await rateLimitQueue;
}

function parseRateLimitWaitMs(headers) {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const asNum = Number.parseFloat(retryAfter);
    if (!Number.isNaN(asNum)) {
      return Math.max(0, Math.ceil(asNum * 1000));
    }
  }

  const reset = headers.get("ratelimit-reset");
  if (!reset) return 0;

  const resetNum = Number.parseFloat(reset);
  if (Number.isNaN(resetNum)) return 0;

  const nowMs = Date.now();

  // If this looks like a Unix timestamp in seconds.
  if (resetNum > 1_000_000_000 && resetNum < 10_000_000_000) {
    return Math.max(0, Math.round(resetNum * 1000 - nowMs));
  }

  // If this looks like a Unix timestamp in milliseconds.
  if (resetNum >= 10_000_000_000) {
    return Math.max(0, Math.round(resetNum - nowMs));
  }

  // Otherwise treat as seconds to wait.
  return Math.max(0, Math.ceil(resetNum * 1000));
}

async function duffelFetch(config, path, options = {}) {
  const maxAttempts = Number.isInteger(config?.duffelMaxAttempts) ? config.duffelMaxAttempts : 4;
  const baseBackoffMs = Number.isInteger(config?.duffelBackoffMs) ? config.duffelBackoffMs : 1500;

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;

    await waitForRateLimitSlot(config);

    const startedAt = Date.now();
    duffelLog(config, `${options?.method || "GET"} ${path} attempt=${attempt}/${maxAttempts}`);

    const response = await fetch(`${config.duffelBaseUrl}${path}`, {
      ...options,
      headers: {
        ...buildHeaders(config),
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }

    if (response.ok) {
      duffelLog(config, `${options?.method || "GET"} ${path} status=${response.status} durationMs=${Date.now() - startedAt}`);
      duffelLogPayload(config, `${options?.method || "GET"} ${path} response`, parsed);
      return parsed;
    }

    const message = parsed?.errors?.[0]?.message || parsed?.message || text || `Duffel error ${response.status}`;
    const shouldRetry = response.status === 429 || response.status >= 500;
    const isLastAttempt = attempt >= maxAttempts;

    if (!shouldRetry || isLastAttempt) {
      duffelLog(
        config,
        `${options?.method || "GET"} ${path} failed status=${response.status} retry=false message="${message}"`
      );
      throw new Error(message);
    }

    const resetWait = parseRateLimitWaitMs(response.headers);
    const jitter = Math.floor(Math.random() * 250);
    const exponential = baseBackoffMs * attempt;
    const waitMs = Math.max(resetWait, exponential) + jitter;

    duffelLog(
      config,
      `${options?.method || "GET"} ${path} retrying after ${waitMs}ms status=${response.status} message="${message}"`
    );
    await sleep(waitMs);
  }

  throw new Error("Duffel request failed after retries");
}

function offerRequestPayload({ origin, destination, departureDate, adults, maxConnections, cabinClass }) {
  const passengers = Array.from({ length: adults }, () => ({ type: "adult" }));

  return {
    data: {
      slices: [
        {
          origin,
          destination,
          departure_date: departureDate
        }
      ],
      passengers,
      cabin_class: cabinClass,
      max_connections: maxConnections
    }
  };
}

export async function searchOffers(config, params) {
  const createPayload = offerRequestPayload(params);
  duffelLog(
    config,
    `search start ${params.origin}->${params.destination} date=${params.departureDate} adults=${params.adults} maxConnections=${params.maxConnections}`
  );
  duffelLogPayload(
    config,
    `search request ${params.origin}->${params.destination} date=${params.departureDate}`,
    createPayload
  );

  const created = await duffelFetch(config, "/air/offer_requests", {
    method: "POST",
    body: JSON.stringify(createPayload)
  });

  const requestId = created?.data?.id;
  if (!requestId) {
    throw new Error("Duffel offer request returned no request id");
  }

  try {
    const offersResult = await duffelFetch(config, `/air/offers?offer_request_id=${encodeURIComponent(requestId)}&limit=50`);
    const offers = Array.isArray(offersResult?.data) ? offersResult.data : [];
    duffelLog(config, `search result requestId=${requestId} offers=${offers.length} source=/air/offers`);
    if (offers.length > 0) {
      return { requestId, offers };
    }
  } catch {
    // Fallback below for versions/accounts where /air/offers filter differs.
  }

  const requestResult = await duffelFetch(config, `/air/offer_requests/${encodeURIComponent(requestId)}`);
  const embeddedOffers = Array.isArray(requestResult?.data?.offers) ? requestResult.data.offers : [];
  duffelLog(config, `search result requestId=${requestId} offers=${embeddedOffers.length} source=/air/offer_requests/{id}`);
  return { requestId, offers: embeddedOffers };
}
