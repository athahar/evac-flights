import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createCrawlerTracker } from "../lib/crawler-tracking.js";

const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const HUMAN = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function harness(options = {}) {
  const calls = [];
  const clock = { now: 1_800_000_000_000 };
  const tracker = createCrawlerTracker({
    posthogKey: "phc_test",
    posthogHost: "https://us.i.posthog.com/",
    fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true }; },
    now: () => clock.now,
    ...options
  });
  function hit(path, { userAgent = GOOGLEBOT, method = "GET", status = 200, headers = {} } = {}) {
    const all = { "user-agent": userAgent, host: "www.dxbflights.info", "x-forwarded-proto": "https", "x-forwarded-for": "66.249.66.1, 10.0.0.1", ...headers };
    const req = { method, path, hostname: "www.dxbflights.info", protocol: "http", get: (name) => all[name.toLowerCase()] };
    const res = new EventEmitter();
    res.statusCode = status;
    let nextCalls = 0;
    tracker(req, res, () => { nextCalls++; });
    res.emit("finish");
    return nextCalls;
  }
  return { calls, hit, clock };
}

test("a crawler page hit becomes a crawler_visit event", () => {
  const { calls, hit } = harness();
  assert.equal(hit("/dubai-mall-guide.html", { status: 200 }), 1);
  assert.equal(calls.length, 1);
  const { url, body } = calls[0];
  assert.equal(url, "https://us.i.posthog.com/i/v0/e/");
  assert.equal(body.api_key, "phc_test");
  assert.equal(body.event, "crawler_visit");
  assert.equal(body.properties.is_bot, true);
  assert.equal(body.properties.bot_name, "Googlebot");
  assert.equal(body.properties.$pathname, "/dubai-mall-guide.html");
  assert.equal(body.properties.$current_url, "https://www.dxbflights.info/dubai-mall-guide.html");
  assert.equal(body.properties.http_status, 200);
  assert.equal(body.properties.$ip, "66.249.66.1");
  assert.equal(body.properties.$process_person_profile, false);
  assert.match(body.distinct_id, /^bot:/);
});

test("sitemap, robots, llms and the homepage count; assets and APIs do not", () => {
  const { calls, hit } = harness();
  for (const path of ["/", "/sitemap.xml", "/robots.txt", "/llms.txt", "/search"]) hit(path);
  assert.equal(calls.length, 5);
  for (const path of ["/app.js", "/styles.css", "/images/burj.jpg", "/api/public-config", "/health", "/api/dashboard/state"]) hit(path);
  assert.equal(calls.length, 5);
});

test("people, POSTs and a missing PostHog key send nothing", () => {
  const { calls, hit } = harness();
  hit("/flights.html", { userAgent: HUMAN });
  hit("/flights.html", { method: "POST" });
  assert.equal(calls.length, 0);
  const keyless = harness({ posthogKey: "" });
  assert.equal(keyless.hit("/flights.html"), 1);
  assert.equal(keyless.calls.length, 0);
});

test("a PostHog failure never breaks the page", () => {
  const rejecting = harness({ fetchImpl: () => Promise.reject(new Error("down")) });
  assert.equal(rejecting.hit("/"), 1);
  const throwing = harness({ fetchImpl: () => { throw new Error("boom"); } });
  assert.doesNotThrow(() => throwing.hit("/"));
});

test("a crawler storm is capped per window, then resumes", () => {
  const { calls, hit, clock } = harness({ limit: 3, windowMs: 60_000 });
  for (let i = 0; i < 10; i++) hit("/");
  assert.equal(calls.length, 3);
  clock.now += 61_000;
  hit("/");
  assert.equal(calls.length, 4);
});
