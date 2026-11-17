export const STORE_COORDS = {
  lat: 8.561593769962128,
  lng: -71.19354670573416,
  name: 'B.B.T. Tienda de Licores · C.C. Millenium',
  address: 'Av. Andrés Bello, C.C. Millenium, Local PB-01 (Entrada), Mérida',
};

export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

export function calculateDeliveryZone(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  const distanceKm = calculateDistanceKm(STORE_COORDS.lat, STORE_COORDS.lng, lat, lng);

  if (distanceKm <= 5) {
    return {
      distanceKm,
      zoneLabel: 'Radio cercano (hasta 5 km)',
      costUsd: 2.0,
      requiresQuote: false,
    };
  }
  if (distanceKm <= 7) {
    return {
      distanceKm,
      zoneLabel: 'Zona media (5 a 7 km)',
      costUsd: 2.5,
      requiresQuote: false,
    };
  }
  if (distanceKm <= 10) {
    return {
      distanceKm,
      zoneLabel: 'Zona extendida (7 a 10 km)',
      costUsd: 3.0,
      requiresQuote: false,
    };
  }

  return {
    distanceKm,
    zoneLabel: 'Fuera de radio estándar (> 10 km)',
    costUsd: null,
    requiresQuote: true,
  };
}
