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
    title: "Mobile data in Dubai: roaming, SIM or eSIM?", shortTitle: "SIM and eSIM in Dubai",
    description: "Compare home-network roaming, a local SIM and a travel eSIM for Dubai. Check phone compatibility, calls, data allowance and setup before you buy.",
    summary: "Keep maps and travel messages handy without guessing what your plan covers.",
    answer: "Compare your home network’s roaming offer with a local SIM or travel eSIM. Check whether you need only data or also a local phone number, and whether your phone supports the plan.",
    sections: [
      { id: "options", title: "Three ways to connect", html: `<div class="table-scroll"><table><thead><tr><th>Option</th><th>Why consider it</th><th>Check before paying</th></tr></thead><tbody>
        <tr><th>Home-network roaming</th><td>Use the SIM already in your phone.</td><td>UAE inclusion, daily charges, limits and calls.</td></tr>
        <tr><th>Local SIM</th><td>Compare local data and voice bundles.</td><td>Documents, opening hours, phone lock and package inclusions.</td></tr>
        <tr><th>Travel eSIM</th><td>Choose a data plan before departure.</td><td>Compatibility, country coverage, validity and activation rule.</td></tr>
      </tbody></table></div>` },
      { id: "esim", title: "A travel eSIM for the UAE", html: `<p>OffWeGoSIM offers prepaid UAE data plans for unlocked, eSIM-compatible phones. These are data-only plans, so they do not include a local number or standard calls and SMS.</p><p>Compare the data allowance and validity for your visit. Open the current plan page to check prices, the network and installation instructions.</p><p><a class="button" href="https://offwegosim.com/united-arab-emirates-esim?utm_source=dxbflights&utm_medium=referral&utm_campaign=dubai_travel_guides&utm_content=mobile_data" data-esim-link="uae">View UAE plans on OffWeGoSIM</a></p><p class="disclosure">DXB Flights and OffWeGoSIM are operated by the same owner.</p>` },
      { id: "setup", title: "Before you leave home", html: `<ol><li>Check that your phone is unlocked and supports eSIM if you choose that option.</li><li>Read the plan’s activation rule before installing. Installation and the start of validity are not always the same event.</li><li>Save the setup instructions where you can find them again.</li><li>Download useful maps and save your hotel address as a fallback.</li></ol><p>On arrival, follow the provider’s instructions for selecting mobile data and roaming settings. Calls or messages on your home SIM may still incur your home provider’s charges.</p>` },
      { id: "onward", title: "Dubai is one stop on your trip?", html: `<p>A UAE plan does not automatically cover Oman, Saudi Arabia or your next destination. Check the exact country list on a regional plan, or choose separate country plans.</p><p>Mobile data also does not guarantee access to every internet calling service. If calls matter to your trip, check the service and plan before relying on it.</p>` }
    ],
    sources: [["OffWeGoSIM: current UAE plans and details", "https://offwegosim.com/united-arab-emirates-esim?utm_source=dxbflights&utm_medium=referral&utm_campaign=dubai_travel_guides&utm_content=mobile_data_source"], ["Dubai Airports: services directory", "https://dubaiairports.ae/experiences/services"]],
    related: ["dubai-airport-to-city", "dubai-layover-guide"]
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
