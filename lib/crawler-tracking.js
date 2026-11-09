// Most crawlers never run JavaScript, so the browser trackers never see them.
// This middleware reports crawler page hits to PostHog from the server as
// `crawler_visit` events. It never delays or changes the response.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const PAGE_PATH = /^\/$|\.(html|xml|txt)$|^\/[^.]*$/;
const NOT_PAGES = /^\/(api|health|runs|seen)(\/|$)/;

// Single source of truth for bot names: the same list the browser uses.
export function loadBotDetector(file = new URL("../public/visit-context.js", import.meta.url)) {
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(readFileSync(file, "utf8"), context);
  return context.dxbDetectBot;
}

export function createCrawlerTracker({
  posthogKey,
  posthogHost = "https://us.i.posthog.com",
  fetchImpl = globalThis.fetch,
  now = Date.now,
  limit = 300,
  windowMs = 10 * 60 * 1000,
  detectBot = loadBotDetector()
} = {}) {
  const endpoint = `${String(posthogHost || "https://us.i.posthog.com").replace(/\/$/, "")}/i/v0/e/`;
  let windowStart = -Infinity;
  let sent = 0;

  function report(req, res, botName, userAgent) {
    const t = now();
    if (t - windowStart > windowMs) {
      windowStart = t;
      sent = 0;
    }
    if (sent >= limit) return;
    sent++;
    const protocol = String(req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim();
    const ip = String(req.get("x-forwarded-for") || "").split(",")[0].trim();
    const body = JSON.stringify({
      api_key: posthogKey,
      event: "crawler_visit",
      distinct_id: `bot:${botName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      timestamp: new Date(t).toISOString(),
      properties: {
        app: "dxb-flight-tracker",
        tracked_by: "server",
        is_bot: true,
        bot_name: botName,
        http_status: res.statusCode,
        $raw_user_agent: userAgent.slice(0, 500),
        $current_url: `${protocol}://${req.hostname}${req.path}`,
        $pathname: req.path,
        $host: req.hostname,
        ...(ip ? { $ip: ip } : {}),
        $process_person_profile: false
      }
    });
    try {
      Promise.resolve(
        fetchImpl(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(3000) })
      ).catch(() => {});
    } catch {
      /* Analytics never affects the site. */
    }
  }

  return function crawlerTracker(req, res, next) {
    try {
      if (posthogKey && (req.method === "GET" || req.method === "HEAD") && PAGE_PATH.test(req.path) && !NOT_PAGES.test(req.path)) {
        const userAgent = String(req.get("user-agent") || "");
        const botName = detectBot(userAgent);
        if (botName) res.once("finish", () => report(req, res, botName, userAgent));
      }
    } catch {
      /* Analytics never affects the site. */
    }
    next();
  };
}
