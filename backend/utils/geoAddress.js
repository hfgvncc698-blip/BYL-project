// Only call a street/building description an address, never just a city name.
function formatGeoAddress(parts = {}) {
  const road = parts.road || parts.pedestrian || parts.residential || parts.footway;
  const street = [parts.house_number, road].filter(Boolean).join(' ');
  const place = street || parts.building || parts.amenity;
  if (!place) return null;
  const city = parts.city || parts.town || parts.village || parts.municipality;
  return [place, [parts.postcode, city].filter(Boolean).join(' '), parts.country].filter(Boolean).join(', ').slice(0, 500);
}
module.exports = { formatGeoAddress };
