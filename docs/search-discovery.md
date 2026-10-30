# Search discovery and Dubai connectivity guide

Updated 30 October 2026.

## Content

The Dubai SIM/eSIM guide addresses choosing between roaming and tourist plans,
airport connectivity, estimating data for 5-day, 7-day and two-week trips,
installation, onward coverage and six practical questions. It links to the
existing itineraries, transport guides and live OffWeGoSIM plan selector.
Photographs break up the article. Prices and temporary free-SIM allowances are
not copied into static editorial text.

Sources: Dubai Airports, Visit Dubai, du, Apple, WhatsApp and the current
OffWeGoSIM UAE plan page. Source links appear alongside the advice and at the
end of the article. No search-volume figures or ranking guarantees are claimed.

The DXB editorial pages use a warm sand background (`#f3efe5`); the embedded
widget keeps its white background. The owner sentence was removed as requested.
Widget colour themes remain future work.

## Generated files

Run `npm run build:guides` after editing content. Commit the generated files.
`npm run check:guides` checks that the public files match their sources.

- `sitemap.xml`: the 39 canonical indexable pages, including 33 travel guides. The noindex disclaimer is excluded.
- `robots.txt`: public pages allowed, API and data paths excluded from crawling.
- `llms.txt`: a short guide index and links to the extended text.
- `llms-advanced.txt`: all travel-guide text and source links.
- `llms-full.txt`: an alias of the extended content for tools using that name.
- The IndexNow verification text file: generated from `content/indexnow.json`.

LLM files are optional discovery aids, not a search-engine indexing requirement
or a ranking factor we can promise. Robots exclusions are not access control.
The old Muscat guide is labelled as a March 2026 archive in these discovery files.

## IndexNow

After the production deployment is live:

```sh
npm run indexnow -- --dry-run
npm run indexnow -- --submit
```

The script checks the deployed sitemap against this release, verifies the
public ownership key, and fetches every URL to check its canonical before
submitting. It rejects private paths, external URLs, query strings, duplicate
URLs, redirects and failed responses. It does not crawl or submit API data.

A dry run never sends an indexing notification. Submission uses the official
endpoint described at <https://www.indexnow.org/documentation>. HTTP 200 means
received; HTTP 202 means received with ownership validation pending. Neither
promises indexing or a particular rank. IndexNow is not a Google Search Console
submission; Google can discover the sitemap from robots.txt.

## Verification

`npm test` includes metadata, canonical URLs, internal links and anchors,
generated text, IndexNow safeguards, flight-tool behaviour and DXB analytics
isolation. Browser checks cover the guide, FAQ interaction, desktop widget
contrast and narrow-screen overflow. Tests use fixtures, with no customer
emails, bookings or payment submissions.
