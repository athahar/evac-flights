// Build the discovery files from the same public content as the HTML pages.
export const origin = 'https://www.dxbflights.info';

export function readableText(html, base = origin) {
  return html
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, label) => `[${label}](${new URL(href.replaceAll('&amp;', '&'), base).href})`)
    .replace(/<summary>([\s\S]*?)<\/summary>/g, '\n### $1\n')
    .replace(/<li>/g, '\n- ').replace(/<\/li>/g, '\n')
    .replace(/<tr>/g, '\n| ').replace(/<\/(?:th|td)>/g, ' | ').replace(/<\/tr>/g, '\n')
    .replace(/<br\s*\/?>|<\/(?:p|ul|ol|div|table|details)>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .split('\n').map(line => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function searchFiles(guides, reviewed, indexnow) {
  if (indexnow.host !== new URL(origin).host || !/^[a-zA-Z0-9-]{8,128}$/.test(indexnow.key)) throw Error('Invalid IndexNow configuration');
  const index = `# DXB Flights\n\n> Independent Dubai and UAE travel guides: itineraries, places, airports, transport and mobile data.\n\nCanonical website: ${origin}/\nEditorial review date: ${reviewed}. Check changing prices, access rules and schedules with the linked official sources.\n\n## Travel guides\n\n- [Places across the UAE](${origin}/places-to-visit-uae.html): Guides grouped by emirate.\n${guides.map(g => `- [${g.title}](${origin}/${g.slug}.html): ${g.summary}`).join('\n')}\n\n## Flight tools\n\n- [Flight availability](${origin}/flights.html): Outbound availability board; confirm with the airline.\n- [Flight search](${origin}/search.html): On-demand search, subject to service availability.\n- [Muscat guide archive](${origin}/uae-to-muscat-guide.html): March 2026 archive, not current operational advice.\n\n## Machine-readable resources\n\n- [Sitemap](${origin}/sitemap.xml): Canonical public page URLs.\n- [Extended guide text](${origin}/llms-advanced.txt): Full travel guide text and sources.\n- [Full-text alias](${origin}/llms-full.txt): The same extended document.\n\n## About the information\n\nOffWeGoSIM plan prices and availability are loaded in the widget. Use the live plan page for current purchase details. These files describe public editorial content only; they contain no customer or booking records.\n`;
  const extended = `${index}\n# Full travel guides\n\n${guides.map(g => `## ${g.title}\n\nCanonical URL: ${origin}/${g.slug}.html\nReviewed: ${reviewed}\n\n${g.answer}\n\n${g.sections.map(s => `### ${s.title}\n\n${readableText(s.html, `${origin}/${g.slug}.html`)}`).join('\n\n')}\n\n### Sources\n\n${g.sources.map(([name, href]) => `- [${name}](${href})`).join('\n')}`).join('\n\n---\n\n')}\n`;
  return new Map([
    ['robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /data/\n\nSitemap: ${origin}/sitemap.xml\n`],
    ['llms.txt', index], ['llms-advanced.txt', extended], ['llms-full.txt', extended],
    [`${indexnow.key}.txt`, `${indexnow.key}\n`],
  ]);
}
