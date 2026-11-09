// Visit context shared by every analytics sender on the site: where the visitor came
// from, campaign tags, whether it is a bot, and a PostHog-style session, so PostHog
// can attribute traffic. Classic script (no imports) so pages, modules, the server
// (lib/crawler-tracking.js) and the node vm tests can all load it.
// Only utm_* tags are read from the URL; other query parameters are never sent.
(function () {
  const SESSION_KEY = 'dxb_session';
  const IDLE_MS = 30 * 60 * 1000;
  const MAX_MS = 24 * 60 * 60 * 1000;
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  let memorySession = null;

  // First match wins. The name is what PostHog shows as bot_name.
  const BOTS = [
    [/googlebot|google-inspectiontool|googleother|storebot-google/i, 'Googlebot'],
    [/adsbot-google|mediapartners-google|apis-google|feedfetcher-google|google-read-aloud|google-site-verification/i, 'Google (other)'],
    [/bingbot|bingpreview|msnbot|adidxbot/i, 'Bingbot'],
    [/chatgpt-user|oai-searchbot|gptbot/i, 'OpenAI'],
    [/claudebot|claude-user|claude-searchbot|anthropic-ai/i, 'Anthropic'],
    [/perplexitybot|perplexity-user/i, 'Perplexity'],
    [/applebot/i, 'Applebot'],
    [/duckduckbot|duckassistbot/i, 'DuckDuckGo'],
    [/yandexbot|yandex\.com\/bots/i, 'Yandex'],
    [/baiduspider/i, 'Baidu'],
    [/petalbot/i, 'PetalBot'],
    [/bytespider/i, 'Bytespider'],
    [/amazonbot/i, 'Amazonbot'],
    [/ccbot/i, 'Common Crawl'],
    [/meta-externalagent|meta-externalfetcher|facebookexternalhit|facebookcatalog/i, 'Meta'],
    [/twitterbot/i, 'X / Twitter'],
    [/linkedinbot/i, 'LinkedIn'],
    [/slackbot/i, 'Slack'],
    [/discordbot/i, 'Discord'],
    [/^whatsapp\//i, 'WhatsApp'],
    [/telegrambot/i, 'Telegram'],
    [/pinterestbot/i, 'Pinterest'],
    [/ahrefsbot|ahrefssiteaudit/i, 'Ahrefs'],
    [/semrushbot/i, 'Semrush'],
    [/mj12bot/i, 'Majestic'],
    [/dotbot/i, 'Moz'],
    [/dataforseobot/i, 'DataForSEO'],
    [/chrome-lighthouse|lighthouse|pagespeed|gtmetrix/i, 'Speed test'],
    [/uptimerobot|pingdom|statuscake|betteruptime|uptime-kuma/i, 'Uptime monitor'],
    [/headlesschrome|phantomjs|puppeteer|playwright|selenium/i, 'Headless browser'],
    [/curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|go-http-client|node-fetch|undici|axios\/|okhttp|java\/|libwww-perl|scrapy/i, 'Script / HTTP client'],
    [/bot\/|[a-z]bot[;)]|\bbot\b|crawler|spider|slurp/i, 'Other bot']
  ];

  // Returns a bot name, or null for what looks like a person's browser.
  globalThis.dxbDetectBot = function (userAgent, nav) {
    const ua = String(userAgent || '');
    if (!ua.trim()) return 'No user agent';
    for (const [pattern, name] of BOTS) if (pattern.test(ua)) return name;
    if (nav && nav.webdriver === true) return 'Automated browser';
    const brands = (nav && nav.userAgentData && nav.userAgentData.brands) || [];
    if (brands.some((b) => /headless/i.test(String(b && b.brand)))) return 'Headless browser';
    return null;
  };

  // Referring host -> readable source. AI before search so gemini.google.com is not "Google".
  const SOURCES = [
    [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, 'ChatGPT', 'ai'],
    [/(^|\.)perplexity\.ai$/, 'Perplexity', 'ai'],
    [/(^|\.)claude\.ai$/, 'Claude', 'ai'],
    [/(^|\.)gemini\.google\.com$/, 'Gemini', 'ai'],
    [/(^|\.)copilot\.microsoft\.com$/, 'Copilot', 'ai'],
    [/^(mail\.google\.com|com\.google\.android\.gm)$/, 'Gmail', 'email'],
    [/^(www\.)?google\.(com|[a-z]{2,3}|com?\.[a-z]{2})$|^com\.google\.android\.googlequicksearchbox$/, 'Google', 'search'],
    [/(^|\.)bing\.com$/, 'Bing', 'search'],
    [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo', 'search'],
    [/^([a-z]{2}\.)?search\.yahoo\.(com|co\.jp)$/, 'Yahoo', 'search'],
    [/^(www\.)?yandex\.(ru|com|com\.tr|by|kz|uz)$/, 'Yandex', 'search'],
    [/(^|\.)baidu\.com$/, 'Baidu', 'search'],
    [/(^|\.)ecosia\.org$/, 'Ecosia', 'search'],
    [/(^|\.)search\.brave\.com$/, 'Brave Search', 'search'],
    [/(^|\.)(facebook\.com|fb\.com|messenger\.com)$/, 'Facebook', 'social'],
    [/(^|\.)instagram\.com$/, 'Instagram', 'social'],
    [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X / Twitter', 'social'],
    [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'LinkedIn', 'social'],
    [/(^|\.)reddit\.com$/, 'Reddit', 'social'],
    [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube', 'social'],
    [/(^|\.)pinterest\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/, 'Pinterest', 'social'],
    [/(^|\.)tiktok\.com$/, 'TikTok', 'social'],
    [/(^|\.)(whatsapp\.com|wa\.me)$/, 'WhatsApp', 'social'],
    [/(^|\.)(t\.me|telegram\.org)$/, 'Telegram', 'social'],
    [/(^|\.)quora\.com$/, 'Quora', 'social']
  ];

  function siteHost(host) {
    return String(host || '').replace(/^www\./, '');
  }

  function trafficSource(referringDomain, tags) {
    if (tags.utm_source) return { source: tags.utm_source, channel: 'campaign' };
    if (referringDomain === '$direct') return { source: 'Direct', channel: 'direct' };
    if (siteHost(referringDomain) === siteHost(location.hostname)) return { source: siteHost(referringDomain), channel: 'internal' };
    for (const [pattern, source, channel] of SOURCES) if (pattern.test(referringDomain)) return { source, channel };
    return { source: siteHost(referringDomain), channel: 'referral' };
  }

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
  // The session remembers the source it started from, so every page carries it.
  function currentSession(now, entry) {
    let session = memorySession;
    try {
      session = JSON.parse(localStorage.getItem(SESSION_KEY)) || session;
    } catch {}
    const valid = session && typeof session.id === 'string' && Number.isFinite(session.last) && Number.isFinite(session.start);
    if (!valid || now - session.last > IDLE_MS || now - session.start > MAX_MS) {
      session = { id: uuidv7(now), start: now };
    }
    if (typeof session.source !== 'string' || typeof session.channel !== 'string') {
      // A session saved before sources were tracked: an internal page can't tell us where it began.
      const startedEarlier = session.start !== now && entry.channel === 'internal';
      session.source = startedEarlier ? 'Unknown' : entry.source;
      session.channel = startedEarlier ? 'unknown' : entry.channel;
    }
    session.last = now;
    memorySession = session;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {}
    return session;
  }

  // Keep the referring page but drop its query string (search terms, tokens).
  function referrer() {
    try {
      const url = new URL(document.referrer);
      return { $referrer: url.origin === 'null' ? url.protocol + '//' + url.host + url.pathname : url.origin + url.pathname, $referring_domain: url.hostname };
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
    const ref = referrer();
    const tags = campaignTags();
    const session = currentSession(Date.now(), trafficSource(ref.$referring_domain, tags));
    const nav = typeof navigator === 'undefined' ? null : navigator;
    const userAgent = nav ? String(nav.userAgent || '') : '';
    const botName = globalThis.dxbDetectBot(userAgent, nav);
    return {
      ...ref,
      ...tags,
      traffic_source: session.source,
      traffic_channel: session.channel,
      is_bot: Boolean(botName),
      ...(botName ? { bot_name: botName } : {}),
      $raw_user_agent: userAgent,
      $current_url: location.origin + location.pathname,
      $pathname: location.pathname,
      $host: location.hostname,
      $session_id: session.id
    };
  };
})();
