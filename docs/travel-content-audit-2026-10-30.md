# DXB Flights: travel content and search audit

Reviewed 30 October 2026. Scope: DXB Flights only. Hajjnama and World Cup work are deferred. No reciprocal links from OffWeGoSIM.

## Evidence and limits

The owner's Search Console screenshot shows 545 impressions and zero Google clicks over three months, with average position 46.6. The separate analytics screenshots show modest pageview counts. Those figures establish some discovery, not a large audience, traveller intent or keyword demand.

This audit used public search results, accessible competitor material, official travel sources and public traveller questions. It does not contain Keyword Planner/Ahrefs volume estimates or the site's query-level Search Console export. The keyword groups below are hypotheses to measure, not proven low-competition terms. “Direct” traffic and visitor-country counts do not by themselves prove why people arrived.

## Competitive landscape

| Alternative | Observed coverage | Implication for DXB Flights |
| --- | --- | --- |
| [Visit Dubai](https://www.visitdubai.com/en/plan-your-trip/weather-in-dubai) | Official seasons, neighbourhoods, transport, events and itineraries. | Use it as a source and link to changing details. Organise our pages around a traveller's decision rather than reproduce its directory. |
| [Lonely Planet](https://www.lonelyplanet.com/articles/first-time-guide-to-dubai) | Indexed first-time, seasonal and practical advice. The full article blocked automated retrieval; comparison is limited to indexed excerpts. | Broad “Dubai guide” coverage is established. Target concrete arrival and planning questions with clear answers. |
| [UAE Guide](https://uae-guide.com/dubai/plan-dubai-visit/dubai-3-day-itinerary/) | Indexed three-day itinerary, linked stay/itinerary variants. Full page retrieval timed out. | A connected planning journey matters; isolated articles are less useful. Do not infer traffic or authority from appearing in a search result. |
| [Dubai Airports](https://dubaiairports.ae/information/transfers) and [RTA](https://www.rta.ae/) | Operational information, connections and transport. | These remain the source of truth. Our role is explaining the choices and directing readers to the right official page. |
| Public traveller discussions | [Late-night public transport](https://www.reddit.com/r/dubai/comments/1gxp1je/), [an overnight connection](https://www.reddit.com/r/dubai/comments/1gyoz6d/), [whether to leave during a layover](https://www.reddit.com/r/dubai/comments/1vv9o65/is_it_worth_leaving_dxb_during_a_6h40_layover_to/). | Real examples of planning uncertainty. Use these as qualitative topic signals, not as factual travel guidance or search-volume data. |

## Implemented page map

| Page | Search-intent examples | What it helps decide |
| --- | --- | --- |
| `/best-time-to-visit-dubai.html` | best time to visit Dubai; Dubai in summer; October vs winter | Weather/activity trade-offs and comparing actual trip dates. |
| `/dubai-airport-to-city.html` | DXB to hotel; Dubai airport taxi or Metro; landing after midnight | Terminal, luggage, late arrival and the last part of the journey. |
| `/dubai-layover-guide.html` | can I leave Dubai airport during a layover; Dubai overnight connection | Usable time, entry eligibility, baggage and return deadlines. |
| `/where-to-stay-in-dubai.html` | Dubai areas for first-time visitors; Downtown or Marina | Match the area to the trip, then check the exact hotel journey. |
| `/dubai-first-time-itinerary.html` | Dubai three-day itinerary; first Dubai visit | Group each day by area and adapt to weather and arrival/departure. |
| `/dubai-sim-esim.html` | Dubai tourist SIM or eSIM; mobile data in Dubai | Compare roaming, SIM and eSIM, including data-only limitations. |
| `/dubai-airports-guide.html` | DXB vs DWC; Dubai airport connection | Read airport codes correctly and avoid confusing two airports with two terminals. |

Each page has a distinct title, description, canonical, one H1, an answer near the top, section navigation, official source links, a review date and related guides. Article and breadcrumb structured data match visible content. No fake reviews, rating markup, guaranteed fares, keyword-stuffed footers or invented first-hand experiences.

## OffWeGoSIM placements

- Connectivity guide → UAE plans. `utm_source=dxbflights`, `utm_medium=referral`, `utm_campaign=dubai_travel_guides`, `utm_content=mobile_data`.
- Flight tools → the destination catalogue, using `utm_content=flight_tools`. Outbound passengers may need a plan for a different country.
- The ownership relationship is disclosed alongside both placements. Prices remain on OffWeGoSIM rather than being copied into static articles.
- Links run only from DXB Flights to OffWeGoSIM. No OffWeGoSIM navigation or footer changes.
- These are useful referral placements, not a promise of ranking or domain-rating improvement. [Google's link guidance](https://developers.google.com/search/docs/essentials/spam-policies#link-spam) distinguishes useful content from link schemes.

## Research sources and freshness

New airport facts were checked against Dubai Airports' [Metro](https://dubaiairports.ae/transport/metro), [taxi](https://dubaiairports.ae/transport/taxi), [transfers](https://dubaiairports.ae/information/transfers) and [immigration](https://dubaiairports.ae/information/immigration-visas) pages. Seasonal and city material draws on Visit Dubai's [weather](https://www.visitdubai.com/en/plan-your-trip/weather-in-dubai), [neighbourhoods](https://www.visitdubai.com/en/explore-dubai/dubai-neighbourhoods), [three-day stopover](https://www.visitdubai.com/articles/dubai-stopover-guide-three-days) and [events calendar](https://www.visitdubai.com/en/festivals-and-events/dubai-events-calendar). Some Visit Dubai pages return bot protection to direct HTTP requests; indexed content and available official page content were used, not assumed full-page access.

The pre-existing Muscat article describes March 2026 conditions. It is labelled as an archive, not rewritten or presented as a newly verified current route guide. Flight APIs and scheduling behaviour were not changed.

## Next content priorities after measurement

1. Export Search Console queries and landing pages after indexing. Separate branded/flight-status searches from tourism planning.
2. Expand the pages earning relevant impressions before creating many near-duplicate variants.
3. Candidate follow-ups: a detailed nol/Metro guide, late-night arrivals, free activities, family trip logistics and a first-day arrival checklist. Research each topic before publication.
4. Add original photographs, route walkthroughs or owner-verified local notes where available. Do not fabricate visits or reviews.
5. Review airport information when operators announce changes; review seasonal and attraction information before promoting it. Do not automatically advance article dates without checking the content.

## Build and review

- Editorial sources: `content/travel-guides.mjs`, `places.mjs`, `emirates.mjs`, `northern-emirates.mjs`, `itineraries.mjs`; photography manifest: `content/photos.mjs`.
- Shared page template and static generation: `scripts/build-travel-guides.mjs`.
- Run `npm run build:guides` after editing content, then `npm run check:guides`.
- Generated HTML is committed alongside source so the existing Express static host needs no new framework or runtime build step.
- Flight board: `/flights.html`; flight search stays `/search.html` (and existing server `/search` route). Old homepage bookmarks containing `origin` or `ff` redirect to the board and preserve their parameters.
- Production deployment and Search Console sitemap submission remain separate from this local review.

### Local verification

- All 23 existing flight parsing/search tests passed using their isolated fixtures.
- Homepage, 33 guides, places directory and photo credits rendered at 390px and 1440px (72 renders): one H1 each, valid JSON-LD, no missing in-page anchors, no horizontal page overflow and no JavaScript errors. Final homepage checked again after layout refinement.
- 996 local links/assets across 40 sitemap pages resolved; sitemap XML parsed; generated files matched their source.
- Legacy `origin`/`ff` bookmarks reached `/flights.html` with parameters intact. Flight search's return link points to the board.
- Mocked browser analytics verified `page_view` and `esim_link_clicked`, preserved the UAE destination and UTMs, and respected Do Not Track. No real analytics events were sent by this check.
- OffWeGoSIM's current attribution parser retained `dxbflights`, `referral`, `dubai_travel_guides` and `mobile_data` without code changes.
- Preview serves static files with analytics disabled. It does not start flight scans, send emails, query paid booking APIs or test live flight inventory.

## Expanded itineraries and places

The homepage now exposes 5-day, 7-day and 14-day routes. The 14-day route uses overnight bases and includes all seven emirates; Liwa and Hatta are clearly marked swaps rather than extra stops squeezed into a day. Each itinerary links to place-specific planning guides.

- Dubai: Burj Khalifa, Dubai Mall, Marina/JBR, Palm Jumeirah, Dubai Frame, Museum of the Future, Old Dubai/souks, desert safaris, Al Marmoom camel racing and Hatta.
- Abu Dhabi: city sights, Yas Island, island choices, Al Ain and Liwa.
- Sharjah: city heritage/art, Mleiha, Khorfakkan/Al Rafisah/Shees.
- Northern emirates: Ras Al Khaimah/Jebel Jais/Dhayah/Jazirat Al Hamra, Ajman/Al Zorah/Masfout, Umm Al Quwain and Fujairah.
- Wadis: Shawka and appropriate alternatives, with a clear distinction between a reservoir visit and a trail, and official weather/access guidance.

Attraction opening status is not assumed. Museum of the Future's temporary exhibition closure was flagged based on its official site at review time. Wadi Wurayah is not promoted as a walk-in attraction. Sir Bani Yas is distinguished from islands close to Abu Dhabi city. Future Yas developments are not listed as open attractions. Each guide cites the relevant tourism authority or operator; volatile prices and racing dates are left to the current official schedule.

Nineteen licensed photographs are stored locally, with photographer/source links in visible captions and `/photo-credits.html`. Place guides include location images; longer itineraries and the stay-area guide have inline photography. Captions distinguish regional images (e.g. Mleiha dunes) from the specific activity discussed (e.g. Al Marmoom racing). No photograph is presented as our own visit.

The homepage keeps a compact connectivity reference. The full eSIM chooser is on `/dubai-sim-esim.html#plans`, with a horizontal layout and six grouped data cards for the eight current UAE variants. It uses the reusable one-line embed, country locked to AE, no referral ID, and the `dxbflights` UTM source. OffWeGoSIM must publish the widget first; these changes remain local for owner review.
