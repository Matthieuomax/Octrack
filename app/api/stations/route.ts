import { NextRequest, NextResponse } from 'next/server'
import { normalizeStation, MAP_FUEL_FIELD } from '@/lib/stationsTypes'
import type { MapFuelType } from '@/lib/stationsTypes'

// API officielle gouvernement français — données temps réel
// https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2/
const ODS_BASE =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const lat = parseFloat(searchParams.get('lat') ?? '48.8566')
  const lng = parseFloat(searchParams.get('lng') ?? '2.3522')
  const radius = Math.min(parseInt(searchParams.get('radius') ?? '15'), 30) // max 30 km
  const fuel = (searchParams.get('fuel') ?? 'sp95') as MapFuelType

  // Filtre spatial uniquement — pas de tri ni de filtre prix côté API
  // (évite les erreurs 400 liées aux clauses ODSQL non supportées).
  // Tout le tri et la logique métier sont faits en JS après réception.
  const where = `distance(geom, geom'POINT(${lng} ${lat})', ${radius}km)`

  const params = new URLSearchParams({
    limit: '100',
    where,
  })

  const url = `${ODS_BASE}?${params.toString()}`

  try {
    const resp = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Octrack-App/1.0',
      },
      // Cache 5 min côté serveur pour ne pas surcharger l'API
      next: { revalidate: 300 },
    })

    if (!resp.ok) {
      const text = await resp.text()
      console.error(`API gouvernement ${resp.status}:`, text.slice(0, 200))
      return NextResponse.json(
        { stations: [], count: 0, error: `API error ${resp.status}` },
        { status: 200 },
      )
    }

    const data = await resp.json()
    const raw: unknown[] = data.results ?? []

    const normalized = raw
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => normalizeStation(r, lat, lng))
      // Supprimer uniquement les stations sans géolocalisation valide
      .filter(Boolean) as NonNullable<ReturnType<typeof normalizeStation>>[]

    // Tri JS : stations avec prix pour le carburant sélectionné en premier (ASC),
    // puis stations sans prix triées par distance.
    const fuelKey = fuel
    const stations = normalized.sort((a, b) => {
      const pa = a.prices[fuelKey]
      const pb = b.prices[fuelKey]
      if (pa !== undefined && pb !== undefined) return pa - pb
      if (pa !== undefined) return -1
      if (pb !== undefined) return 1
      return (a.distance ?? 999) - (b.distance ?? 999)
    })

    return NextResponse.json(
      {
        stations,
        count: stations.length,
        meta: {
          lat,
          lng,
          radius,
          fuel,
          fetchedAt: new Date().toISOString(),
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      },
    )
  } catch (err) {
    console.error('Stations fetch error:', err)
    return NextResponse.json(
      {
        stations: [],
        count: 0,
        error: 'Impossible de contacter l\'API carburant',
      },
      { status: 200 },
    )
  }
}
