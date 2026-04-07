export type MapFuelType = 'sp95' | 'sp98' | 'e10' | 'gazole' | 'e85' | 'gplc'

export const MAP_FUEL_LABELS: Record<MapFuelType, string> = {
  sp95: 'SP95',
  sp98: 'SP98',
  e10: 'E10',
  gazole: 'Diesel',
  e85: 'E85',
  gplc: 'GPL',
}

export const MAP_FUEL_FIELD: Record<MapFuelType, string> = {
  sp95: 'sp95_prix',
  sp98: 'sp98_prix',
  e10: 'e10_prix',
  gazole: 'gazole_prix',
  e85: 'e85_prix',
  gplc: 'gplc_prix',
}

export interface StationPrices {
  sp95?: number
  sp98?: number
  e10?: number
  gazole?: number
  e85?: number
  gplc?: number
}

export interface Station {
  id: string
  nom: string
  adresse: string
  ville: string
  cp: string
  lat: number
  lng: number
  distance?: number // km
  prices: StationPrices
}

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function parsePrice(val: unknown): number | undefined {
  if (val === null || val === undefined || val === '') return undefined
  const n = parseFloat(String(val))
  return isNaN(n) || n <= 0.5 ? undefined : n
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getGeo(raw: any): { lat: number; lng: number } | null {
  const geom = raw.geom
  if (!geom) return null

  // ODS v2 returns geo as { lon, lat } object OR GeoJSON Point
  if (typeof geom.lat === 'number' && typeof geom.lon === 'number') {
    return { lat: geom.lat, lng: geom.lon }
  }
  if (Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
    // GeoJSON: [longitude, latitude]
    return { lat: geom.coordinates[1], lng: geom.coordinates[0] }
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeStation(raw: any, userLat?: number, userLng?: number): Station | null {
  const geo = getGeo(raw)
  if (!geo) return null
  if (isNaN(geo.lat) || isNaN(geo.lng)) return null

  const station: Station = {
    id: String(raw.id ?? Math.random()),
    nom: String(raw.nom ?? raw.Nom ?? ''),
    adresse: String(raw.adresse ?? raw.Adresse ?? ''),
    ville: String(raw.ville ?? raw.Ville ?? ''),
    cp: String(raw.cp ?? raw.CP ?? ''),
    lat: geo.lat,
    lng: geo.lng,
    prices: {
      sp95: parsePrice(raw.sp95_prix ?? raw.prix_sp95),
      sp98: parsePrice(raw.sp98_prix ?? raw.prix_sp98),
      e10: parsePrice(raw.e10_prix ?? raw.prix_e10),
      gazole: parsePrice(raw.gazole_prix ?? raw.prix_gazole),
      e85: parsePrice(raw.e85_prix ?? raw.prix_e85),
      gplc: parsePrice(raw.gplc_prix ?? raw.prix_gplc),
    },
  }

  if (userLat !== undefined && userLng !== undefined) {
    station.distance = haversineDistance(userLat, userLng, geo.lat, geo.lng)
  }

  return station
}

export function formatDistance(km: number | undefined): string {
  if (km === undefined) return ''
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

export function getPriceForFuel(station: Station, fuelType: MapFuelType): number | undefined {
  return station.prices[fuelType]
}
