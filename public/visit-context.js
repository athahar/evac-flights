// Visit context shared by every analytics sender on the site: where the visitor came
// from, campaign tags and a PostHog-style session, so PostHog can attribute traffic.
// Classic script (no imports) so pages, modules and the node vm tests can all load it.
// Only utm_* tags are read from the URL; other query parameters are never sent.
(function () {
  const SESSION_KEY = 'dxb_session';
  const IDLE_MS = 30 * 60 * 1000;
  const MAX_MS = 24 * 60 * 60 * 1000;
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  let memorySession = null;

  // PostHog's sessions table expects UUIDv7 session IDs (millisecond timestamp prefix).
  function uuidv7(now) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let ts = now;
    for (let i = 5; i >= 0; i--) {
      bytes[i] = ts % 256;
      ts = Math.floor(ts / 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x70;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Same session rules as posthog-js: new session after 30 idle minutes or 24 hours.
  function sessionId(now) {
    let session = memorySession;
    try {
      session = JSON.parse(localStorage.getItem(SESSION_KEY)) || session;
    } catch {}
    const valid = session && typeof session.id === 'string' && Number.isFinite(session.last) && Number.isFinite(session.start);
    if (!valid || now - session.last > IDLE_MS || now - session.start > MAX_MS) {
      session = { id: uuidv7(now), start: now };
    }
    session.last = now;
    memorySession = session;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {}
    return session.id;
  }

  // Keep the referring page but drop its query string (search terms, tokens).
  function referrer() {
    try {
      const url = new URL(document.referrer);
      return { $referrer: url.origin + url.pathname, $referring_domain: url.hostname };
    } catch {
      return { $referrer: '$direct', $referring_domain: '$direct' };
    }
  }

  function campaignTags() {
    const tags = {};
    const params = new URLSearchParams(location.search);
    for (const key of UTM_KEYS) {
      const value = params.get(key);
      if (value) tags[key] = value;
    }
    return tags;
  }

  globalThis.dxbVisitContext = function () {
    return {
      ...referrer(),
      ...campaignTags(),
      $current_url: location.origin + location.pathname,
      $pathname: location.pathname,
      $host: location.hostname,
      $session_id: sessionId(Date.now())
    };
  };
})();
