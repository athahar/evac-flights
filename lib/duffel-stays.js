import { duffelFetch } from "./duffel.js";

/**
 * Search Duffel Stays API for accommodations near a location.
 *
 * @param {object} config - Duffel config (duffelToken, duffelBaseUrl, etc.)
 * @param {object} params
 * @param {number} params.latitude
 * @param {number} params.longitude
 * @param {string} params.checkInDate  - YYYY-MM-DD
 * @param {string} params.checkOutDate - YYYY-MM-DD
 * @param {number} [params.rooms=1]
 * @param {number} [params.adults=2]
 * @param {number} [params.children=0]
 * @param {number} [params.radiusKm=25]
 * @returns {Promise<{results: Array}>}
 */
export async function searchStays(config, params) {
  const {
    latitude, longitude,
    checkInDate, checkOutDate,
    rooms = 1, adults = 2, children = 0,
    radiusKm = 25
  } = params;

  const guests = [];
  for (let i = 0; i < rooms; i++) {
    const room = { type: "room" };
    // Distribute adults across rooms
    const roomAdults = i === 0
      ? adults - Math.floor(adults / rooms) * (rooms - 1)
      : Math.floor(adults / rooms);
    room.adults = Math.max(1, roomAdults);
    if (children > 0 && i === 0) {
      room.children = Array.from({ length: children }, () => ({ age: 10 }));
    }
    guests.push(room);
  }

  // If only 1 room, keep it simple
  if (rooms === 1) {
    guests.length = 0;
    const room = { type: "room", adults };
    if (children > 0) {
      room.children = Array.from({ length: children }, () => ({ age: 10 }));
    }
    guests.push(room);
  }

  const payload = {
    data: {
      location: {
        radius: radiusKm,
        geographic_coordinates: {
          latitude,
          longitude
        }
      },
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      guests
    }
  };

  console.log(`[duffel-stays] search lat=${latitude} lng=${longitude} checkin=${checkInDate} checkout=${checkOutDate} rooms=${rooms} adults=${adults} children=${children}`);

  const result = await duffelFetch(config, "/stays/search", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const results = Array.isArray(result?.data?.results) ? result.data.results : [];
  console.log(`[duffel-stays] found ${results.length} accommodations`);
  return { results };
}
