// Editorial source for the static travel site. Rebuild with npm run build:guides.
// Keep volatile facts linked to official sources and review dates explicit.
export const reviewed = "2026-10-30";
export const guides = [
  {
    slug: "best-time-to-visit-dubai", category: "When to go", icon: "sun",
    title: "When is the best time to visit Dubai?",
    shortTitle: "Best time to visit Dubai",
    description: "Choose when to visit Dubai for outdoor sightseeing, a beach break or an indoor summer trip. Seasonal trade-offs and what to check before booking.",
    summary: "Start with the weather, then compare the cost of your whole trip.",
    answer: "For a first trip with plenty of time outdoors, start with November to March. October and April can also work if you plan around warmer days.",
    sections: [
      { id: "seasons", title: "Choose the trip you want", html: `<div class="table-scroll"><table><thead><tr><th>When</th><th>Plan around</th><th>The trade-off</th></tr></thead><tbody>
        <tr><th>November–March</th><td>Outdoor sightseeing, walking and beach time</td><td>Popular dates need an early price check.</td></tr>
        <tr><th>April & October</th><td>A mix of outdoor mornings and indoor afternoons</td><td>Allow for warmer days.</td></tr>
        <tr><th>May–September</th><td>Indoor attractions, restaurants and a hotel-led break</td><td>Heat changes how much you can do outside.</td></tr>
      </tbody></table></div><p>Visit Dubai describes October to April as the main outdoor season. Summer offers can make a trip appealing, but a lower room price does not make a long outdoor itinerary comfortable. Choose the season for your activities first.</p>` },
      { id: "your-dates", title: "Compare actual dates, not just months", html: `<p>Price the same trip on two or three sets of dates: flights, the same room type, transport and the attractions you would actually book. A hotel offer has little value if the flight cost cancels it out.</p><p>Look at the official events calendar before paying. A concert, exhibition or holiday can change availability on particular dates. Check cancellation terms as carefully as the headline price.</p>` },
      { id: "summer", title: "If you visit in summer", html: `<p>Build a day that works even if you skip the outdoor part. Put a museum, indoor attraction or relaxed meal in the middle of the day, and keep transport between stops straightforward.</p><p>For a beach-focused stay, check what the hotel actually includes: beach access, pool hours, shade and transport. For city sightseeing, compare the walk from your accommodation to the station, not just its distance on a map.</p>` },
      { id: "before-booking", title: "Before you book", html: `<ul><li>Check the forecast close to departure. Seasonal guidance is not a forecast for your dates.</li><li>Check opening dates for seasonal attractions directly with the venue.</li><li>Choose an area that suits your plans using our <a href="/where-to-stay-in-dubai.html">neighbourhood guide</a>.</li><li>Leave room to swap an outdoor day with an indoor one.</li></ul>` }
    ],
    sources: [["Visit Dubai: weather and seasons", "https://www.visitdubai.com/en/plan-your-trip/weather-in-dubai"], ["Dubai Calendar", "https://www.visitdubai.com/en/festivals-and-events/dubai-events-calendar"]],
    related: ["where-to-stay-in-dubai", "dubai-first-time-itinerary"]
  },
  {
    slug: "dubai-airport-to-city", category: "Arriving", icon: "train",
    title: "Dubai Airport to the city: Metro or taxi?", shortTitle: "Dubai airport transfers",
    description: "Compare the Metro, airport taxis and prebooked transfers from DXB. Terminal access, late arrivals, luggage and the last part of the journey.",
    summary: "Choose your transfer by terminal, arrival time and hotel location.",
    answer: "The Red Line serves DXB Terminals 1 and 3. Airport taxis operate around the clock. Your hotel’s location and your arrival time decide which is more useful.",
    sections: [
      { id: "compare", title: "Compare the whole journey", html: `<div class="table-scroll"><table><thead><tr><th>Option</th><th>Useful when</th><th>Check first</th></tr></thead><tbody>
        <tr><th>Metro</th><td>Your hotel is convenient to a station and you can manage your luggage.</td><td>Last train, changes and the final walk.</td></tr>
        <tr><th>Airport taxi</th><td>You arrive late, have several bags or want a direct journey.</td><td>Vehicle size and the metered fare.</td></tr>
        <tr><th>Prebooked transfer</th><td>You need a confirmed pickup arrangement.</td><td>Meeting point, waiting time and child-seat requests.</td></tr>
      </tbody></table></div>` },
      { id: "metro", title: "Taking the Metro", html: `<p>Follow the Metro signs in Terminal 1 or 3. Tickets and nol cards are available at the stations. Terminal 2 does not have the same direct station access.</p><p>Check RTA’s current timetable for the station and direction you need. An advertised network closing time is not a promise that a train will leave your station at that time. Allow time for passport control, baggage and the walk to the platform.</p><p>Dubai Airports lists a two-piece luggage allowance, including hand luggage. Check current size restrictions before choosing the Metro with large bags.</p>` },
      { id: "taxi", title: "Taking an airport taxi", html: `<p>Use the designated taxi rank at your terminal. Dubai Airports lists a starting fare of AED 25; this is the start of the metered journey, not the total price to your hotel. Distance and applicable charges affect the final amount.</p><p>Save the exact hotel entrance and address before leaving the terminal. Similar hotel names and different branches can make a simple pickup confusing.</p>` },
      { id: "late-arrival", title: "Landing after midnight?", html: `<p>Plan the late-arrival option before you fly. If your train connection is uncertain, compare an airport taxi with a prebooked transfer. Check whether your accommodation expects a late check-in.</p><p>If you land at DWC, use our <a href="/dubai-airports-guide.html">airport guide</a>: it is a separate airport, not another DXB terminal. For maps and pickup messages, see <a href="/dubai-sim-esim.html">mobile data in Dubai</a>.</p>` }
    ],
    sources: [["Dubai Airports: Metro", "https://dubaiairports.ae/transport/metro"], ["Dubai Airports: taxi ranks and fares", "https://dubaiairports.ae/transport/taxi"], ["RTA: journey planning", "https://www.rta.ae/"]],
    related: ["dubai-airports-guide", "dubai-sim-esim"]
  },
  {
    slug: "dubai-layover-guide", category: "Connections", icon: "plane",
    title: "A Dubai layover: should you leave the airport?", shortTitle: "Plan a Dubai layover",
    description: "Work out whether a DXB layover leaves time for the city. Separate tickets, baggage, terminal changes and an honest return-to-airport checklist.",
    summary: "Work back from your next flight before making a sightseeing plan.",
    answer: "A layover length alone is not enough to decide. Confirm entry eligibility, baggage arrangements and your next check-in or boarding deadline before planning time outside the airport.",
    sections: [
      { id: "time", title: "Count usable time, not the gap between flights", html: `<p>Start with the time you must be back for your next flight. Subtract your return journey, airport procedures, the trip into the city and time to get off the first flight. What remains is your sightseeing window.</p><p>A flight arriving late or a long queue can consume that window. Keep a plan that still works if you stay at the airport. There is no universal number of hours that guarantees a city visit will fit.</p>` },
      { id: "tickets", title: "One booking and separate tickets are different", html: `<p>Ask your airline whether your bags are checked through and where you receive the next boarding pass. On separate tickets, collecting bags and checking in again may require passing through immigration. Do not assume that staying “in transit” resolves this.</p><p>Dubai Airports directs connecting passengers to transfer desks for boarding-pass assistance. Its transfer guidance also explains baggage arrangements and terminal connections. Confirm your own itinerary with the airline.</p>` },
      { id: "city", title: "If a city visit fits, choose one area", html: `<p>Pick one neighbourhood and one main activity. An airport connection is a poor time to combine Old Dubai, Downtown and the Marina in a single outing.</p><p>Check the attraction’s opening hours against your actual window. An overnight stop and a daytime stop need different plans. A meal and a rest may serve you better than a rushed tour.</p><p>Use our <a href="/dubai-airport-to-city.html">transfer guide</a> to choose how you will get back, then save the return route before leaving.</p>` },
      { id: "checklist", title: "Four things to confirm", html: `<ol><li>Your eligibility to enter the UAE, using official guidance and your airline.</li><li>Whether baggage must be collected or can remain checked through.</li><li>The correct airport, terminal and check-in deadline for the next flight.</li><li>A return plan with enough margin for delays.</li></ol><p>A change between DXB and DWC is a journey between two airports. See the <a href="/dubai-airports-guide.html">DXB and DWC guide</a> before booking a connection.</p>` }
    ],
    sources: [["Dubai Airports: transfers", "https://dubaiairports.ae/information/transfers"], ["Dubai Airports: passport control and visas", "https://dubaiairports.ae/information/immigration-visas"]],
    related: ["dubai-airport-to-city", "dubai-first-time-itinerary"]
  },
  {
    slug: "where-to-stay-in-dubai", category: "Neighbourhoods", icon: "pin",
    title: "Where to stay in Dubai for a first visit", shortTitle: "Where to stay in Dubai",
    description: "Compare Downtown Dubai, Deira, Bur Dubai, Marina, JBR and Palm Jumeirah by the trip you want, then check transport before booking a hotel.",
    summary: "Pick an area for your days, not just the hotel’s photos.",
    answer: "Start with Downtown for landmark sightseeing, Deira or Bur Dubai for the Creek and old-city districts, and Marina or JBR for a waterfront stay. Then compare the actual journey from each hotel.",
    sections: [
      { id: "areas", title: "A quick neighbourhood comparison", html: `<div class="table-scroll"><table><thead><tr><th>Area</th><th>What draws visitors</th><th>Before you choose</th></tr></thead><tbody>
        <tr><th>Downtown</th><td>Burj Khalifa, Dubai Mall and major landmarks.</td><td>Check the walk from the hotel entrance to the places on your list.</td></tr>
        <tr><th>Deira & Bur Dubai</th><td>Souks, the Creek and historic neighbourhoods.</td><td>Compare the right side of the Creek and your nearest station.</td></tr>
        <tr><th>Dubai Marina & JBR</th><td>Waterfront promenades, restaurants and beach time.</td><td>Check the connection to Metro or tram, not just the distance to water.</td></tr>
        <tr><th>Palm Jumeirah</th><td>Resort hotels, beach clubs and a hotel-focused break.</td><td>Check beach access and the cost of trips away from the resort.</td></tr>
      </tbody></table></div>` },
      { id: "shortlist", title: "Make a shortlist of three hotels", html: `<p>Use the same dates, occupancy and cancellation terms. Mark your two or three must-do activities on a map, then compare journeys from each hotel.</p><p>A room that costs less can still create a more expensive trip if every outing needs a long taxi ride. A central-looking pin can also hide a lengthy walk around a road, mall or station entrance.</p>` },
      { id: "questions", title: "Check the details the listing photo cannot show", html: `<ul><li>Which facilities are included, and which cost extra?</li><li>Does the room setup work for everyone in your group?</li><li>Can you check in at your arrival time?</li><li>Is the route to public transport manageable with your group and in the season you are visiting?</li><li>Are taxes, breakfast and cancellation terms included in the comparison?</li></ul>` },
      { id: "match-trip", title: "Match the area to the length of your stay", html: `<p>For a short visit, keeping your main activities close together matters more than seeing every district. For a longer break, you have room to dedicate separate days to different parts of the city.</p><p>Our <a href="/dubai-first-time-itinerary.html">three-day outline</a> groups stops by area. Use it to test whether a hotel location fits the trip you want.</p>` }
    ],
    sources: [["Visit Dubai: neighbourhoods", "https://www.visitdubai.com/en/explore-dubai/dubai-neighbourhoods"], ["Dubai Government: neighbourhood guide", "https://www.dubai.ae/web/dubai.ae/visit/staying-in-dubai/dubai-neighborhoods/"]],
    related: ["best-time-to-visit-dubai", "dubai-first-time-itinerary"]
  },
  {
    slug: "dubai-first-time-itinerary", category: "Things to do", icon: "compass",
    title: "Three days in Dubai: a first-visit outline", shortTitle: "Three days in Dubai",
    description: "A flexible three-day Dubai itinerary grouped by area: the Creek, Downtown and the waterfront. Plan around your interests, weather and arrival time.",
    summary: "One part of the city each day, with room to change your mind.",
    answer: "Use one day for the Creek and Old Dubai, one for Downtown, and one for the waterfront or your main special-interest activity. Treat this as three full days, not an arrival afternoon plus two days.",
    sections: [
      { id: "old-dubai", title: "Day 1: the Creek and Old Dubai", html: `<p>Start with Al Fahidi Historical Neighbourhood, then build the rest of your day around the Creek. An abra crossing and the souks can fit into the same area-focused outing.</p><p>Choose a place for lunch and leave time to look around. You do not need a ticketed attraction in every gap. Check current transport details and venue hours before setting out.</p>` },
      { id: "downtown", title: "Day 2: Downtown", html: `<p>Group Dubai Mall and the Burj Khalifa area together. If an observation deck is important to you, choose a specific ticket and time slot from the operator before arranging the rest of the day.</p><p>Decide what you want to spend time on: the view, shopping, an indoor attraction or a longer meal. Trying to do all of them can make one district feel rushed.</p>` },
      { id: "waterfront", title: "Day 3: waterfront or a personal favourite", html: `<p>Marina and JBR suit a day built around a waterfront walk and beach time. For a different trip, use this day for a museum, a booked activity or a quieter hotel day instead.</p><p>For a tour outside the city, check the operator’s pickup area, return time, included activities and cancellation policy. Do not squeeze a return-time-dependent excursion immediately before your flight.</p>` },
      { id: "adjust", title: "Adjust the outline to your trip", html: `<ul><li><strong>Hot weather:</strong> keep the middle of the day flexible and favour indoor stops.</li><li><strong>Children or mixed mobility:</strong> reduce the number of transitions and check access directly with venues.</li><li><strong>Two days:</strong> choose the two areas you care about most. Do not compress all three.</li><li><strong>Departure day:</strong> plan airport travel first, then fit in anything else.</li></ul><p>Check <a href="/best-time-to-visit-dubai.html">when to visit</a> and <a href="/where-to-stay-in-dubai.html">where to stay</a> before turning this outline into bookings.</p>` }
    ],
    sources: [["Visit Dubai: a three-day stopover", "https://www.visitdubai.com/articles/dubai-stopover-guide-three-days"], ["Visit Dubai: Al Fahidi", "https://www.visitdubai.com/en/places-to-visit/al-fahidi-historical-neighbourhood"], ["Visit Dubai: free things to do", "https://www.visitdubai.com/articles/top-free-things-to-do-in-dubai"]],
    related: ["where-to-stay-in-dubai", "dubai-airport-to-city"]
  },
  {
    slug: "dubai-sim-esim", category: "Staying connected", icon: "signal",
    title: "Dubai eSIM and tourist SIM guide", shortTitle: "SIM and eSIM in Dubai",
    description: "Compare Dubai eSIMs, tourist SIM cards and roaming. Plan your data allowance, check airport options and set up your phone before arriving in the UAE.",
    summary: "Airport SIM options, data budgeting and a practical eSIM setup checklist.",
    answer: "Need maps, messages and a ride from the airport? Compare your roaming allowance with a tourist SIM or prepaid UAE eSIM. Start with your phone, the length of your stay and whether you need a local number.",
    sections: [
      { id: "options", title: "Roaming, tourist SIM or travel eSIM?", html: `<div class="table-scroll"><table><thead><tr><th>Option</th><th>Useful when</th><th>Check first</th></tr></thead><tbody>
        <tr><th>Home-network roaming</th><td>Your existing plan includes the UAE.</td><td>Daily fees, fair-use limits and charges for calls.</td></tr>
        <tr><th>Local tourist SIM</th><td>You want to compare local data and voice bundles.</td><td>Passport or ID requirements, opening hours and whether a local number is included.</td></tr>
        <tr><th>Travel eSIM</th><td>You want to buy mobile data before departure.</td><td>Phone compatibility, carrier lock, coverage and when validity starts.</td></tr>
      </tbody></table></div><p>The cheapest option depends on what you already have. Check your home provider’s UAE roaming offer before buying another plan. A data-only eSIM will not replace a local number if you need standard calls or SMS.</p>` },
      { id: "airport", title: "Can you get connected at Dubai airport?", html: `<p>DXB and DWC offer free airport Wi-Fi. Use it to retrieve your hotel address, arrange your <a href="/dubai-airport-to-city.html">airport transfer</a> or follow installation instructions. Save those details offline before flying as a backup.</p><p>Local operators also have tourist SIM offers. Compare the current <a href="https://www.du.ae/touristesim">du tourist eSIM offer</a> and <a href="https://www.visitdubai.com/en/articles/sim-card-for-tourists">Visit Dubai’s tourist SIM guidance</a>. Welcome allowances, eligibility and expiry can differ by offer, so check the terms rather than assuming a free SIM covers your whole stay.</p><p>For a short connection, airport Wi-Fi may be enough. If you plan to leave the terminal, read the <a href="/dubai-layover-guide.html">Dubai layover guide</a> and decide how you will get online once outside.</p>` },
      { id: "data-budget", title: "How much data do you need for Dubai?", html: `<p>Look at the mobile-data usage in your phone settings. Maps, messaging and occasional searches use your allowance differently from video, cloud backups or a laptop hotspot.</p><p><strong>A planning example:</strong> if you normally use 400 MB a day, seven days would be about 2.8 GB. Add room for heavier travel use. This is an example based on your own usage, not a promise that 3 GB will suit every trip.</p><ul><li><strong>5 days:</strong> choose validity that covers both arrival and departure, then estimate data for your <a href="/dubai-5-day-itinerary.html">five-day Dubai route</a>.</li><li><strong>7 days:</strong> check exact activation and expiry times if you are arriving early and leaving late. Our <a href="/dubai-7-day-itinerary.html">week-long itinerary</a> also visits Abu Dhabi.</li><li><strong>2 weeks:</strong> allow for extra navigation and day trips. The <a href="/uae-2-week-itinerary.html">two-week UAE route</a> travels beyond Dubai.</li></ul><p>Download maps on Wi-Fi, turn off mobile-data photo backups and check hotspot use. Buying more gigabytes does not always give you more days; compare both.</p>` },
      { id: "esim", title: "Compare prepaid UAE data plans", html: `<p>OffWeGoSIM’s UAE plans are data-only and cover the UAE, including Dubai and Abu Dhabi. Choose your allowance and validity in the live plan selector below. It shows current prices, currencies and the total for multiple phones.</p><p>Hotspot and top-ups are supported. Each phone needs its own compatible, unlocked device and eSIM. Check the selected plan’s network and activation details before paying.</p><p><a class="button" href="#plans">Compare UAE data plans</a></p>` },
      { id: "setup", title: "Set up your eSIM before you arrive", html: `<ol><li><strong>Check the exact phone model.</strong> It must support eSIM and be unlocked. On iPhone, look in Settings → General → About for “No SIM restrictions” under Carrier Lock. See <a href="https://support.apple.com/en-us/118227">Apple’s travel eSIM guidance</a>; for Android, check the manufacturer’s instructions for your model.</li><li><strong>Install while you have Wi-Fi.</strong> Follow the QR code, supported one-click installation or manual instructions provided with the eSIM.</li><li><strong>Read the activation rule.</strong> Installing a profile and starting the data allowance can be different events. Follow your chosen plan’s instructions.</li><li><strong>Choose the travel line for mobile data.</strong> Enable data roaming on that line if the provider requires it. Keep data roaming off on your home line if you want to avoid using its roaming data.</li><li><strong>Save the instructions.</strong> Keep your order page and hotel address accessible offline. Your home SIM’s calls and messages can still incur charges.</li></ol>` },
      { id: "onward", title: "Abu Dhabi, the other emirates and Oman", html: `<p>Dubai, Abu Dhabi, Sharjah and the other emirates are in the UAE. A UAE plan covers the country, subject to the provider’s network coverage. Mountain, desert and remote-road coverage can vary; download your route before a day trip.</p><p>Oman is a separate country. A UAE-only plan does not automatically work there. For a trip crossing the border, compare a regional plan’s actual country list with separate UAE and Oman plans. Mobile data does not guarantee that every internet calling service will work.</p>` },
      { id: "questions", title: "Dubai SIM and eSIM questions", html: `<details><summary>Can I buy a Dubai eSIM before travelling?</summary><p>Yes. Check your phone’s compatibility and the plan’s activation rules first. Save the instructions and install using a reliable Wi-Fi connection.</p></details>
        <details><summary>Does a Dubai eSIM come with a UAE phone number?</summary><p>Not necessarily. OffWeGoSIM’s UAE plans provide data without a local number or standard calls and SMS. Compare a local tourist voice bundle if you need those services.</p></details>
        <details><summary>Can I keep my usual WhatsApp number?</summary><p>You can <a href="https://faq.whatsapp.com/5315147411944059/">keep the number already registered in WhatsApp</a> while using another SIM for mobile data. Keep access to your registered number if WhatsApp asks you to verify it again. Calling features depend on local service availability.</p></details>
        <details><summary>Can my family share one eSIM?</summary><p>One installed eSIM belongs on one phone. A hotspot can share that phone’s connection when supported, but everyone must stay nearby. Separate eSIMs let each person use their own phone independently.</p></details>
        <details><summary>Can I add data without installing again?</summary><p>OffWeGoSIM supports top-ups on the same eSIM. Open My eSIMs and choose the relevant phone’s plan when you need more data.</p></details>
        <details><summary>What if the eSIM does not connect on arrival?</summary><p>Check that the eSIM is enabled, selected for mobile data and set up according to the provider’s roaming instructions. Use Wi-Fi to contact support if needed. Avoid deleting the eSIM while troubleshooting.</p></details>` }
    ],
    sources: [["OffWeGoSIM: current UAE plans and details", "https://offwegosim.com/united-arab-emirates-esim?utm_source=dxbflights&utm_medium=referral&utm_campaign=dubai_travel_guides&utm_content=mobile_data_source"], ["Apple: using an eSIM while travelling", "https://support.apple.com/en-us/118227"], ["Visit Dubai: tourist SIM cards", "https://www.visitdubai.com/en/articles/sim-card-for-tourists"], ["du: tourist eSIM offers", "https://www.du.ae/touristesim"], ["Dubai Airports: free Wi-Fi at DXB and DWC", "https://media.dubaiairports.ae/passengers-enjoy-unlimited-free-high-speed-wi-fi-at-dxb-and-dwc/"]],
    related: ["dubai-airport-to-city", "dubai-layover-guide", "dubai-7-day-itinerary"]
  },
  {
    slug: "dubai-airports-guide", category: "Airports & flights", icon: "plane",
    title: "DXB or DWC? Check your Dubai airport", shortTitle: "DXB and DWC airports",
    description: "Understand DXB and DWC before booking a Dubai flight or connection. Check airport codes, terminals, baggage and your onward journey.",
    summary: "Two Dubai airports. Check the code on every flight.",
    answer: "DXB is Dubai International. DWC is Dubai World Central, also called Al Maktoum International. They are separate airports, so an airport change needs its own transfer plan.",
    sections: [
      { id: "codes", title: "Read the airport code, then the terminal", html: `<div class="table-scroll"><table><thead><tr><th>Code</th><th>Airport</th><th>What to check</th></tr></thead><tbody>
        <tr><th>DXB</th><td>Dubai International</td><td>Terminal 1, 2 or 3, as shown on your booking.</td></tr>
        <tr><th>DWC</th><td>Dubai World Central / Al Maktoum International</td><td>Ground transport for DWC, not a DXB terminal transfer.</td></tr>
      </tbody></table></div><p>Check each leg of a return trip separately. A search result labelled “Dubai” does not establish that every flight uses the same airport.</p>` },
      { id: "connections", title: "Changing airports is not an airside connection", html: `<p>Dubai Airports places DWC approximately 60 km from DXB. A transfer between them involves entering the UAE, collecting baggage where required, ground travel and another check-in.</p><p>Ask the airline or booking provider how much connection time your itinerary needs. Account for entry requirements, traffic and baggage; do not judge the connection using driving time alone.</p>` },
      { id: "flight-checks", title: "Before paying for a flight", html: `<ul><li>Check the airport code and terminal for arrival and departure.</li><li>Check whether connecting flights are on one booking or separate tickets.</li><li>Read baggage allowances and transfer arrangements.</li><li>Check your hotel transfer for the correct airport.</li><li>Verify the latest schedule directly with the airline.</li></ul>` },
      { id: "tools", title: "Check your flight", html: `<p>Use the <a href="https://dubaiairports.ae/flight-status">official Dubai Airports flight status</a> and your airline for operational updates.</p><p>Our <a href="/flights.html">outbound flight tools</a> provide an additional availability view. They do not replace the airline’s confirmation and do not cover every flight into or out of Dubai.</p><p>For a longer connection, use our <a href="/dubai-layover-guide.html">layover checklist</a>. For a city stay, start with <a href="/dubai-airport-to-city.html">airport transport</a>.</p>` }
    ],
    sources: [["Dubai Airports: transfers and airport information", "https://dubaiairports.ae/information/transfers"], ["DWC: official airport website", "https://dwc.dubaiairports.ae/"]],
    related: ["dubai-layover-guide", "dubai-airport-to-city"]
  }
];
