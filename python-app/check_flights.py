#!/usr/bin/env python3
"""
check_flights.py
----------------
Dead simple. No DB, no email, no infra.

Just: what flights can you actually book from DXB on March 5, 6, 7?

Usage:
    pip install requests
    DUFFEL_TOKEN=your_token python check_flights.py

Output: printed to console + saved to flights_found.txt
"""

import os
import sys
import time
import requests
from datetime import datetime

# ─── Config ──────────────────────────────────────────────────────────────────

DUFFEL_TOKEN   = os.getenv("DUFFEL_TOKEN", "")
ORIGIN         = "DXB"
PAX            = 1
CHECK_DATES    = ["2026-03-05", "2026-03-06", "2026-03-07"]

# Every major airport outside the Middle East worth checking
DESTINATIONS = [
    # South Asia (highest demand from DXB diaspora)
    "BOM", "DEL", "BLR", "HYD", "MAA", "CCU", "COK", "AMD",
    "KHI", "LHE", "ISB", "CMB", "DAC", "KTM", "MLE",
    # Southeast Asia
    "SIN", "BKK", "KUL", "CGK", "MNL", "SGN", "HAN",
    # East Asia
    "HKG", "NRT", "ICN", "PVG", "PEK", "KIX",
    # Europe
    "LHR", "LGW", "CDG", "AMS", "FRA", "MUC", "MAD", "FCO",
    "ZRH", "VIE", "BCN", "ATH", "LCA", "WAW", "ARN", "CPH",
    # North America
    "JFK", "EWR", "LAX", "ORD", "SFO", "IAD", "YYZ",
    # Africa
    "NBO", "ADD", "JNB", "LOS",
    # Central Asia / Caucasus
    "TAS", "ALA", "GYD", "TBS", "EVN",
    # Oceania
    "SYD", "MEL",
]

# Any offer with a segment touching these → skip
ME_AIRPORTS = {
    "DXB","AUH","SHJ","DWC","RKT","FJR",          # UAE
    "RUH","JED","DMM","MED",                        # Saudi
    "BAH","KWI","DOH",                              # Bahrain/Kuwait/Qatar
    "MCT","AMM","BEY","TLV",                        # Oman/Jordan/Lebanon/Israel
    "BGW","BSR","EBL","DAM","CAI","IKA","THR","SAH" # Iraq/Syria/Egypt/Iran/Yemen
}

HEADERS = {
    "Authorization":  f"Bearer {DUFFEL_TOKEN}",
    "Duffel-Version": "v2",
    "Content-Type":   "application/json",
    "Accept":         "application/json",
}

# ─── Helpers ─────────────────────────────────────────────────────────────────

def is_clean(offer):
    for sl in offer.get("slices", []):
        for seg in sl.get("segments", []):
            if seg.get("origin",      {}).get("iata_code") in ME_AIRPORTS: return False
            if seg.get("destination", {}).get("iata_code") in ME_AIRPORTS: return False
    return True

def fmt(iso):
    return iso[:16].replace("T", " ") if iso else "?"

def search(dest, dep_date):
    try:
        r = requests.post(
            "https://api.duffel.com/air/offer_requests",
            headers=HEADERS,
            json={"data": {
                "slices":      [{"origin": ORIGIN, "destination": dest, "departure_date": dep_date}],
                "passengers":  [{"type": "adult"}] * PAX,
                "cabin_class": "economy",
                "max_connections": 1,
            }},
            timeout=25,
        )
        if r.status_code == 200:
            return r.json().get("data", {}).get("offers", [])
        return []
    except Exception:
        return []

# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    if not DUFFEL_TOKEN:
        sys.exit("❌  Set DUFFEL_TOKEN environment variable first.\n"
                 "    export DUFFEL_TOKEN=duffel_test_xxxx")

    print(f"\n{'='*65}")
    print(f"  EVAC FLIGHT CHECK  |  {ORIGIN}  |  {', '.join(CHECK_DATES)}")
    print(f"{'='*65}\n")

    results   = []   # (date, dest, flight, airline, dep, arr, stops, price)
    zero_routes = [] # routes that returned nothing

    total_queries = len(DESTINATIONS) * len(CHECK_DATES)
    done = 0

    for dest in DESTINATIONS:
        for dep_date in CHECK_DATES:
            done += 1
            print(f"  [{done:>3}/{total_queries}] {ORIGIN}→{dest}  {dep_date} ... ", end="", flush=True)

            offers = search(dest, dep_date)
            clean  = [o for o in offers if is_clean(o)]

            if not clean:
                print("—")
                zero_routes.append(f"{dest} {dep_date}")
                time.sleep(0.3)
                continue

            # Pick cheapest clean offer for display
            try:
                best = min(clean, key=lambda o: float(o.get("total_amount", 9999)))
            except Exception:
                best = clean[0]

            segs       = best["slices"][0]["segments"]
            first, last = segs[0], segs[-1]
            airline    = first.get("marketing_carrier", {}).get("name", "?")
            iata       = first.get("marketing_carrier", {}).get("iata_code", "?")
            flight_no  = iata + first.get("marketing_carrier_flight_number", "?")
            dep        = fmt(first.get("departing_at"))
            arr        = fmt(last.get("arriving_at"))
            stops      = len(segs) - 1
            stop_lbl   = "direct" if stops == 0 else f"{stops}-stop"
            price      = f"{best.get('total_currency','USD')} {best.get('total_amount','?')}"
            offer_id   = best.get("id", "")

            row = (dep_date, dest, flight_no, airline, dep, arr, stop_lbl, price, offer_id)
            results.append(row)

            print(f"✅  {flight_no:<10} {dep}  {stop_lbl:<8}  {price}")
            time.sleep(0.3)

    # ─── Summary ─────────────────────────────────────────────────────────

    print(f"\n{'='*65}")
    print(f"  RESULTS: {len(results)} routes with available flights")
    print(f"{'='*65}\n")

    if not results:
        print("  ⚠️  No bookable flights found across all destinations + dates.\n"
              "  This likely means:\n"
              "    1. Duffel token is in sandbox mode (limited airlines)\n"
              "    2. All routes genuinely suspended due to crisis\n"
              "    3. Contact Duffel support for production access\n")
        return

    # Group by date
    for check_date in CHECK_DATES:
        day_rows = [r for r in results if r[0] == check_date]
        if not day_rows:
            print(f"  {check_date}: no flights found\n")
            continue

        print(f"  ── {check_date} ({len(day_rows)} routes) ──────────────────────────\n")
        for r in sorted(day_rows, key=lambda x: x[7]):  # sort by price
            date_, dest, flight, airline, dep, arr, stops, price, oid = r
            print(f"    {flight:<10}  {ORIGIN}→{dest:<4}  {dep}  {arr}  {stops:<8}  {price}")
            print(f"              {airline}")
            if oid:
                print(f"              https://app.duffel.com/offers/{oid}")
            print()

    # Save to file
    out_lines = [f"EVAC FLIGHT CHECK — {ORIGIN} — {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}\n",
                 f"Dates: {', '.join(CHECK_DATES)}\n\n"]
    for r in results:
        date_, dest, flight, airline, dep, arr, stops, price, oid = r
        out_lines.append(f"{date_}  {flight}  {ORIGIN}→{dest}  {dep}  {stops}  {price}\n")
        out_lines.append(f"       {airline}\n")
        if oid:
            out_lines.append(f"       https://app.duffel.com/offers/{oid}\n")
        out_lines.append("\n")

    with open("flights_found.txt", "w") as f:
        f.writelines(out_lines)

    print(f"\n  Saved to flights_found.txt")
    print(f"  Zero-result routes: {len(zero_routes)} (not shown)")

if __name__ == "__main__":
    main()
