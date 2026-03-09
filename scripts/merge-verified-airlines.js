import fs from "node:fs";
import path from "node:path";

const airlinesPath = path.resolve(process.cwd(), "data/input/airlines.json");
const raw = fs.readFileSync(airlinesPath, "utf8");
const parsed = JSON.parse(raw);
const airlines = Array.isArray(parsed?.airlines) ? parsed.airlines : [];

// Verified from official airport airline directories on 2026-03-07.
// Only add carriers with an official airport-listed website or a directly
// verified official airline domain. Leave uncertain carriers out.
const verifiedEntries = [
  { name: "Air Arabia", iata: "G9", website: "https://www.airarabia.com/", booking_url: "https://www.airarabia.com/" },
  { name: "Air Arabia Abu Dhabi", website: "https://www.airarabia.com/", booking_url: "https://www.airarabia.com/" },
  { name: "Air Mauritius", iata: "MK", website: "https://www.airmauritius.com/", booking_url: "https://www.airmauritius.com/" },
  { name: "Air Peace", iata: "APK", website: "https://www.flyairpeace.com/", booking_url: "https://www.flyairpeace.com/" },
  { name: "Air Samarkand", website: "https://airsamarkand.com/en/", booking_url: "https://airsamarkand.com/en/" },
  { name: "Air Seychelles", iata: "HM", website: "https://www.airseychelles.com/", booking_url: "https://www.airseychelles.com/" },
  { name: "AJet", iata: "VF", website: "https://ajet.com/en", booking_url: "https://ajet.com/en" },
  { name: "Akasa Air", website: "https://www.akasaair.com/", booking_url: "https://www.akasaair.com/" },
  { name: "Animawings", iata: "A2", website: "https://www.animawings.com/", booking_url: "https://www.animawings.com/" },
  { name: "British Airways", iata: "BA", website: "https://www.britishairways.com/", booking_url: "https://www.britishairways.com/" },
  { name: "Cathay Pacific", iata: "CX", website: "https://www.cathaypacific.com/", booking_url: "https://www.cathaypacific.com/" },
  { name: "Delta Air Lines", iata: "DL", website: "https://www.delta.com/", booking_url: "https://www.delta.com/" },
  { name: "Egyptair", iata: "MS", website: "https://www.egyptair.com/", booking_url: "https://www.egyptair.com/" },
  { name: "Etihad Airways", iata: "EY", website: "https://www.etihad.com/", booking_url: "https://www.etihad.com/" },
  { name: "Fly Jinnah", iata: "9P", website: "https://www.flyjinnah.com/", booking_url: "https://www.flyjinnah.com/" },
  { name: "flyadeal", iata: "F3", website: "https://www.flyadeal.com/", booking_url: "https://www.flyadeal.com/" },
  { name: "Gulf Air", iata: "GF", website: "https://www.gulfair.com/", booking_url: "https://www.gulfair.com/" },
  { name: "Jazeera Airways", iata: "J9", website: "https://www.jazeeraairways.com/", booking_url: "https://www.jazeeraairways.com/" },
  { name: "KLM", iata: "KL", website: "https://www.klm.com/", booking_url: "https://www.klm.com/" },
  { name: "Kuwait Airways", iata: "KU", website: "https://www.kuwaitairways.com/", booking_url: "https://www.kuwaitairways.com/" },
  { name: "Malaysia Airlines", iata: "MH", website: "https://www.malaysiaairlines.com/", booking_url: "https://www.malaysiaairlines.com/" },
  { name: "Middle East Airlines", iata: "ME", website: "https://www.mea.com.lb/", booking_url: "https://www.mea.com.lb/" },
  { name: "Nile Air", iata: "NP", website: "https://www.nileair.com/", booking_url: "https://www.nileair.com/" },
  { name: "Pegasus Airlines", iata: "PC", website: "https://www.flypgs.com/", booking_url: "https://www.flypgs.com/" },
  { name: "Philippine Airlines", iata: "PR", website: "https://www.philippineairlines.com/", booking_url: "https://www.philippineairlines.com/" },
  { name: "Pobeda", iata: "DP", website: "https://www.pobeda.aero/", booking_url: "https://www.pobeda.aero/" },
  { name: "Qatar Airways", iata: "QR", website: "https://www.qatarairways.com/", booking_url: "https://www.qatarairways.com/" },
  { name: "Red Wings Airlines", iata: "WZ", website: "https://flyredwings.com/en/", booking_url: "https://flyredwings.com/en/" },
  { name: "Royal Jordanian", iata: "RJ", website: "https://www.rj.com/", booking_url: "https://www.rj.com/" },
  { name: "Saudia", iata: "SV", website: "https://www.saudia.com/", booking_url: "https://www.saudia.com/" },
  { name: "Serene Air", iata: "ER", website: "https://www.sereneair.com/", booking_url: "https://www.sereneair.com/" },
  { name: "SunExpress", iata: "XQ", website: "https://www.sunexpress.com/", booking_url: "https://www.sunexpress.com/" },
  { name: "Tarco Aviation", iata: "3T", website: "https://www.tarcoaviation.com/", booking_url: "https://www.tarcoaviation.com/" },
  { name: "Turkish Airlines", iata: "TK", website: "https://www.turkishairlines.com/", booking_url: "https://www.turkishairlines.com/" },
  { name: "Turkmenistan Airlines", iata: "T5", website: "https://turkmenistanairlines.tm/en", booking_url: "https://turkmenistanairlines.tm/en" },
  { name: "Uganda Airlines", iata: "UR", website: "https://www.ugandairlines.com/", booking_url: "https://www.ugandairlines.com/" },
  { name: "United Airlines", iata: "UA", website: "https://www.united.com/", booking_url: "https://www.united.com/" },
  { name: "VietJet Air", iata: "VJ", website: "https://www.vietjetair.com/", booking_url: "https://www.vietjetair.com/" },
  { name: "Vietnam Airlines", iata: "VN", website: "https://www.vietnamairlines.com/", booking_url: "https://www.vietnamairlines.com/" },
  { name: "Wizz Air Malta", iata: "W4", website: "https://wizzair.com/", booking_url: "https://wizzair.com/" }
];

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeIata(value) {
  return String(value || "").trim().toUpperCase();
}

function sortAirlines(a, b) {
  const byName = String(a.name || "").localeCompare(String(b.name || ""));
  if (byName !== 0) return byName;
  return String(a.iata || "").localeCompare(String(b.iata || ""));
}

for (const verified of verifiedEntries) {
  const verifiedIata = normalizeIata(verified.iata);
  const verifiedName = normalizeName(verified.name);

  let idx = -1;
  if (verifiedIata) {
    idx = airlines.findIndex((item) => normalizeIata(item.iata) === verifiedIata);
  }
  if (idx === -1 && verifiedName) {
    idx = airlines.findIndex((item) => normalizeName(item.name) === verifiedName);
  }

  if (idx >= 0) {
    airlines[idx] = {
      ...airlines[idx],
      ...verified
    };
  } else {
    airlines.push({
      ...verified,
      deeplink_template: null,
      deeplink_confidence: "none"
    });
  }
}

airlines.sort(sortAirlines);

parsed.airlines = airlines;
parsed._meta = parsed._meta || {};
parsed._meta.generated = "2026-03-07";

const note = "Official airport-directory verification pass added/updated passenger airline websites on 2026-03-07.";
const notes = Array.isArray(parsed._meta.notes) ? parsed._meta.notes : [];
if (!notes.includes(note)) {
  notes.push(note);
}
parsed._meta.notes = notes;

fs.writeFileSync(airlinesPath, `${JSON.stringify(parsed, null, 2)}\n`);
console.log(`Updated ${airlines.length} airlines in ${airlinesPath}`);
