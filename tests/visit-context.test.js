import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const source = readFileSync(new URL("../public/visit-context.js", import.meta.url), "utf8");
const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function load({ url = "https://www.dxbflights.info/dubai-7-day-itinerary.html", referrer = "", storage = new Map(), now = 1_800_000_000_000, userAgent = CHROME_MAC, webdriver = false } = {}) {
  const clock = { now };
  const context = {
    navigator: { userAgent, webdriver },
    URL,
    URLSearchParams,
    crypto: webcrypto,
    location: new URL(url),
    document: { referrer },
    Date: { now: () => clock.now },
    localStorage: storage && {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return { visit: () => context.dxbVisitContext(), clock };
}

test("external referrer keeps origin and path but drops search terms", () => {
  const { visit } = load({ referrer: "https://www.google.com/search?q=dubai+itinerary" });
  const ctx = visit();
  assert.equal(ctx.$referrer, "https://www.google.com/search");
  assert.equal(ctx.$referring_domain, "www.google.com");
});

test("no referrer is reported as $direct", () => {
  const ctx = load().visit();
  assert.equal(ctx.$referrer, "$direct");
  assert.equal(ctx.$referring_domain, "$direct");
});

test("only utm tags are read from the URL; other params never appear", () => {
  const ctx = load({ url: "https://www.dxbflights.info/flights.html?utm_source=newsletter&utm_campaign=oct&email=private@example.com&origin=DXB" }).visit();
  assert.equal(ctx.utm_source, "newsletter");
  assert.equal(ctx.utm_campaign, "oct");
  assert.equal(ctx.$current_url, "https://www.dxbflights.info/flights.html");
  assert.equal(ctx.$pathname, "/flights.html");
  assert.equal(JSON.stringify(ctx).includes("private"), false);
  assert.equal(JSON.stringify(ctx).includes("origin=DXB"), false);
});

test("session is a UUIDv7 that persists across page loads within 30 idle minutes", () => {
  const storage = new Map();
  const first = load({ storage }).visit().$session_id;
  assert.match(first, UUIDV7);
  const second = load({ storage, now: 1_800_000_000_000 + 29 * 60 * 1000 }).visit().$session_id;
  assert.equal(second, first);
});

test("session rotates after 30 idle minutes and after 24 hours", () => {
  const storage = new Map();
  const { visit, clock } = load({ storage });
  const first = visit().$session_id;
  clock.now += 31 * 60 * 1000;
  const afterIdle = visit().$session_id;
  assert.notEqual(afterIdle, first);
  for (let i = 0; i < 51; i++) {
    clock.now += 29 * 60 * 1000; // stay active, never idle (51 x 29 min = 24.65 h)
    visit();
  }
  assert.notEqual(visit().$session_id, afterIdle);
});

test("a corrupted stored session is replaced instead of living forever", () => {
  for (const stored of ['{"id":"x"}', "not json", '"just a string"', '{"id":1,"last":1,"start":1}']) {
    const storage = new Map([["dxb_session", stored]]);
    const id = load({ storage }).visit().$session_id;
    assert.match(id, UUIDV7, stored);
  }
});

test("blocked storage still yields a stable session for the page", () => {
  const throwing = { get: () => { throw new Error("blocked"); }, set: () => { throw new Error("blocked"); } };
  const { visit } = load({ storage: throwing });
  const a = visit().$session_id;
  assert.match(a, UUIDV7);
  assert.equal(visit().$session_id, a);
});

const HUMAN_UAS = {
  "Chrome on Mac": CHROME_MAC,
  "Safari on iPhone": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  "Facebook in-app": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.0]",
  "Instagram in-app": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0",
  "LinkedIn in-app": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30",
  "CUBOT phone": "Mozilla/5.0 (Linux; Android 11; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
};

test("real browsers are labelled human", () => {
  for (const [label, userAgent] of Object.entries(HUMAN_UAS)) {
    const ctx = load({ userAgent }).visit();
    assert.equal(ctx.is_bot, false, label);
    assert.equal("bot_name" in ctx, false, label);
    assert.equal(ctx.$raw_user_agent, userAgent, label);
  }
});

test("crawlers and automated browsers are labelled with a bot name", () => {
  const cases = {
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)": "Googlebot",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.0.0 Safari/537.36": "Bingbot",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot": "OpenAI",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)": "Anthropic",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36": "Headless browser",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)": "Meta",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)": "Ahrefs",
    "Mozilla/5.0 (compatible; SomeNewCrawler/1.0)": "Other bot"
  };
  for (const [userAgent, name] of Object.entries(cases)) {
    const ctx = load({ userAgent }).visit();
    assert.equal(ctx.is_bot, true, userAgent);
    assert.equal(ctx.bot_name, name, userAgent);
  }
  const driven = load({ webdriver: true }).visit();
  assert.equal(driven.is_bot, true);
  assert.equal(driven.bot_name, "Automated browser");
});

test("the referrer is turned into a readable source and channel", () => {
  const cases = [
    ["https://www.google.com/search?q=dubai", "Google", "search"],
    ["https://www.google.co.uk/", "Google", "search"],
    ["android-app://com.google.android.googlequicksearchbox/", "Google", "search"],
    ["https://www.bing.com/search?q=dxb", "Bing", "search"],
    ["https://duckduckgo.com/", "DuckDuckGo", "search"],
    ["https://chatgpt.com/", "ChatGPT", "ai"],
    ["https://www.perplexity.ai/search/x", "Perplexity", "ai"],
    ["https://gemini.google.com/app", "Gemini", "ai"],
    ["https://claude.ai/chat/x", "Claude", "ai"],
    ["https://l.facebook.com/l.php?u=x", "Facebook", "social"],
    ["https://t.co/abc", "X / Twitter", "social"],
    ["https://www.reddit.com/r/dubai", "Reddit", "social"],
    ["https://www.someblog.com/post", "someblog.com", "referral"],
    ["https://mail.google.com/", "Gmail", "email"],
    ["android-app://com.google.android.gm/", "Gmail", "email"],
    ["https://docs.google.com/document/d/x", "docs.google.com", "referral"],
    ["https://google.evil.example/", "google.evil.example", "referral"],
    ["https://google.com.evil.example/", "google.com.evil.example", "referral"],
    ["https://mail.yahoo.com/", "mail.yahoo.com", "referral"],
    ["https://search.yahoo.com/search?p=dubai", "Yahoo", "search"],
    ["", "Direct", "direct"]
  ];
  for (const [referrer, source, channel] of cases) {
    const ctx = load({ referrer }).visit();
    assert.equal(ctx.traffic_source, source, referrer);
    assert.equal(ctx.traffic_channel, channel, referrer);
  }
});

test("utm tags name the source of a campaign visit", () => {
  const ctx = load({ url: "https://www.dxbflights.info/?utm_source=newsletter&utm_medium=email", referrer: "" }).visit();
  assert.equal(ctx.traffic_source, "newsletter");
  assert.equal(ctx.traffic_channel, "campaign");
});

test("every page of a visit keeps the source the visit started from", () => {
  const storage = new Map();
  const first = load({ storage, referrer: "https://www.google.com/search?q=dubai" }).visit();
  const second = load({ storage, now: 1_800_000_000_000 + 60_000, referrer: "https://www.dxbflights.info/dubai-7-day-itinerary.html", url: "https://www.dxbflights.info/flights.html" }).visit();
  assert.equal(second.$session_id, first.$session_id);
  assert.equal(second.traffic_source, "Google");
  assert.equal(second.traffic_channel, "search");
  assert.equal(second.$referring_domain, "www.dxbflights.info"); // the per-page referrer stays accurate
});

test("a session saved before this change keeps its id and gains a source", () => {
  const now = 1_800_000_000_000;
  const storage = new Map([["dxb_session", JSON.stringify({ id: "01900000-0000-7000-8000-000000000000", start: now - 60_000, last: now - 60_000 })]]);
  const ctx = load({ storage, now, referrer: "https://chatgpt.com/" }).visit();
  assert.equal(ctx.$session_id, "01900000-0000-7000-8000-000000000000");
  assert.equal(ctx.traffic_source, "ChatGPT");
});

test("a session saved before this change, now on an internal page, is marked unknown rather than internal", () => {
  const now = 1_800_000_000_000;
  const storage = new Map([["dxb_session", JSON.stringify({ id: "01900000-0000-7000-8000-000000000000", start: now - 60_000, last: now - 60_000 })]]);
  const ctx = load({ storage, now, referrer: "https://www.dxbflights.info/dubai-7-day-itinerary.html" }).visit();
  assert.equal(ctx.$session_id, "01900000-0000-7000-8000-000000000000");
  assert.equal(ctx.traffic_source, "Unknown");
  assert.equal(ctx.traffic_channel, "unknown");
});
