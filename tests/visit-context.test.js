import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const source = readFileSync(new URL("../public/visit-context.js", import.meta.url), "utf8");
const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function load({ url = "https://www.dxbflights.info/dubai-7-day-itinerary.html", referrer = "", storage = new Map(), now = 1_800_000_000_000 } = {}) {
  const clock = { now };
  const context = {
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
