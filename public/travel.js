// Existing board bookmarks keep working after the homepage becomes a guide.
const params = new URLSearchParams(location.search);
if ((location.pathname === '/' || location.pathname === '/index.html') &&
    (params.has('origin') || params.has('ff'))) {
  location.replace(`/flights.html${location.search}${location.hash}`);
}

// This host uses DXB's existing project. The embedded iframe reports separately
// to OffWeGoSIM; never forward widget events into this site's project.
function analyticsAllowed() {
  return navigator.doNotTrack !== '1' && window.doNotTrack !== '1' && navigator.globalPrivacyControl !== true;
}
const queue = [];
let capture;
function track(event, properties = {}) {
  if (!analyticsAllowed()) return;
  const entry = {event, properties, timestamp: new Date().toISOString()};
  if (capture) capture(entry);
  else if (queue.length < 40) queue.push(entry);
}
const pageType = location.pathname === '/' || location.pathname === '/index.html' ? 'travel_home' : 'travel_guide';
track('$pageview');
track('page_view'); // Preserve the existing DXB dashboards.
document.addEventListener('click', event => {
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!link) return;
  let url;
  try { url = new URL(link.href, location.href); } catch { return; }
  if (!['http:', 'https:'].includes(url.protocol)) return;
  const placement = link.dataset.placement || (link.closest('header') ? 'header' : link.closest('footer') ? 'footer' : link.closest('aside') ? 'sidebar' : 'content');
  if (link.hasAttribute('data-esim-link')) {
    track('esim_link_clicked', {destination: link.dataset.esimLink, placement, utm_source: 'dxbflights'});
  } else if (url.origin !== location.origin) {
    track('outbound_link_clicked', {target_host: url.hostname, placement});
  } else if (url.pathname === location.pathname && url.hash) {
    track('guide_section_clicked', {section: url.hash.slice(1), placement});
  } else {
    const kind = /\/(flights|search)\.html$/.test(url.pathname) ? 'flight_search_clicked' : /itinerary/.test(url.pathname) ? 'itinerary_clicked' : 'guide_link_clicked';
    track(kind, {target_path: url.pathname, placement});
  }
});
const depths = new Set();
let pendingScroll = false;
window.addEventListener('scroll', () => {
  if (pendingScroll) return;
  pendingScroll = true;
  requestAnimationFrame(() => {
    pendingScroll = false;
    if (document.documentElement.scrollHeight <= innerHeight) return;
    const depth = (scrollY + innerHeight) / document.documentElement.scrollHeight * 100;
    for (const percent of [25, 50, 75, 90]) if (depth >= percent && !depths.has(percent)) {
      depths.add(percent);
      track('guide_read_progress', {percent});
    }
  });
}, {passive: true});
async function initAnalytics() {
  if (!analyticsAllowed()) return;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch('/api/public-config', {signal: controller.signal});
    if (!response.ok) return;
    const config = await response.json();
    if (!config.posthogKey) return;
    const key = 'evac_posthog_distinct_id';
    let distinctId;
    try { distinctId = localStorage.getItem(key); } catch {}
    if (!distinctId) {
      distinctId = crypto.randomUUID();
      try { localStorage.setItem(key, distinctId); } catch {}
    }
    const endpoint = `${(config.posthogHost || 'https://us.i.posthog.com').replace(/\/$/, '')}/i/v0/e/`;
    capture = entry => {
      if (!analyticsAllowed()) return;
      const payload = JSON.stringify({api_key: config.posthogKey, event: entry.event, distinct_id: distinctId, timestamp: entry.timestamp, properties: {
        ...(globalThis.dxbVisitContext?.() || {}), ...entry.properties, app: 'dxb-flight-tracker', path: location.pathname, page: pageType,
        $current_url: location.origin + location.pathname, $pathname: location.pathname, $host: location.hostname,
        $title: document.title, $process_person_profile: false
      }});
      fetch(endpoint, {method: 'POST', headers: {'Content-Type': 'text/plain'}, body: payload, credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true}).catch(() => {});
    };
    for (const entry of queue.splice(0)) capture(entry);
  } catch { /* Reading and navigation never depend on analytics. */ }
  finally { clearTimeout(timer); }
}
void initAnalytics();
