'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Fuel,
  Navigation,
  AlertCircle,
  Loader2,
  LocateFixed,
} from 'lucide-react'
import { useApp } from '@/components/AppContext'
import type { Station, MapFuelType } from '@/lib/stationsTypes'
import { MAP_FUEL_LABELS, formatDistance, getPriceForFuel } from '@/lib/stationsTypes'

/* ── Map (SSR désactivé — Leaflet besoin de window) ── */
const StationsMap = dynamic(() => import('@/components/map/StationsMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center" style={{ background: '#0E0E12' }}>
      <Loader2 size={28} className="animate-spin" style={{ color: '#FF5500' }} />
    </div>
  ),
})

/* ── Tuiles ── */
const FUEL_TYPES: MapFuelType[] = ['sp95', 'sp98', 'e10', 'gazole', 'e85', 'gplc']
type SheetSnap = 'peek' | 'half' | 'full'

/** Convertit le FuelType des réglages (diesel/gpl) vers le MapFuelType de la carte (gazole/gplc) */
function toMapFuelType(ft: string): MapFuelType {
  const map: Record<string, MapFuelType> = {
    sp95: 'sp95', sp98: 'sp98', e10: 'e10',
    diesel: 'gazole', gazole: 'gazole',
    e85: 'e85', gpl: 'gplc', gplc: 'gplc',
  }
  return (map[ft] as MapFuelType) ?? 'sp95'
}

const SNAP_PORTRAIT: Record<SheetSnap, string> = {
  peek: 'translateY(calc(85dvh - 142px))',
  half: 'translateY(calc(85dvh - 52dvh))',
  full: 'translateY(0px)',
}

/* ─────────────────────────────────────────────────────────────
   Hooks utilitaires
───────────────────────────────────────────────────────────── */

/** Détecte le mode paysage smartphone (hauteur < 500px) */
function useIsLandscape(): boolean {
  const [ls, setLs] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 500px)')
    setLs(mq.matches)
    const h = (e: MediaQueryListEvent) => setLs(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  return ls
}

/** Résout la préférence de thème (dark / light / system → boolean) */
function useIsDark(): boolean {
  const { settings } = useApp()
  const [sysDark, setSysDark] = useState(true)

  useEffect(() => {
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setSysDark(mq.matches)
    const h = (e: MediaQueryListEvent) => setSysDark(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [settings.theme])

  if (settings.theme === 'dark') return true
  if (settings.theme === 'light') return false
  return sysDark
}

/* ─────────────────────────────────────────────────────────────
   Sous-composants
───────────────────────────────────────────────────────────── */

function RankBadge({ rank }: { rank: number }) {
  return (
    <div
      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
      style={{
        fontFamily: 'var(--font-condensed)',
        backgroundColor:
          rank === 0 ? 'var(--color-accent)' : rank < 3 ? 'rgba(41,169,209,0.12)' : 'var(--color-surface-2)',
        color: rank === 0 ? 'white' : rank < 3 ? 'var(--color-info)' : 'var(--color-muted)',
        border: rank > 0 && rank < 3 ? '1.5px solid rgba(41,169,209,0.3)' : 'none',
        boxShadow: rank === 0 ? '0 2px 10px rgba(255,85,0,0.35)' : 'none',
      }}
    >
      {rank + 1}
    </div>
  )
}

function StationCard({
  station, rank, fuelType, selected, onClick,
}: {
  station: Station; rank: number; fuelType: MapFuelType; selected: boolean; onClick: () => void
}) {
  const price = getPriceForFuel(station, fuelType)
  const label = station.nom || station.adresse || 'Station'

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:opacity-80"
      style={{
        backgroundColor: selected ? 'rgba(255,85,0,0.08)' : 'transparent',
        borderBottom: '1px solid var(--color-border)',
        borderLeft: selected ? '3px solid var(--color-accent)' : '3px solid transparent',
      }}
    >
      <RankBadge rank={rank} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-content)' }}>
          {label}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {station.ville && (
            <span className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>
              {station.ville}
            </span>
          )}
          {station.distance !== undefined && (
            <span className="text-xs font-medium flex-shrink-0" style={{ color: selected ? 'var(--color-accent)' : 'var(--color-info)' }}>
              {formatDistance(station.distance)}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end flex-shrink-0">
        {price !== undefined ? (
          <>
            <p
              className="text-2xl font-bold leading-none"
              style={{ fontFamily: 'var(--font-condensed)', color: rank === 0 ? 'var(--color-accent)' : 'var(--color-content)' }}
            >
              {price.toFixed(3)}
            </p>
            <p className="text-[9px] mt-0.5" style={{ color: 'var(--color-muted)' }}>€/L</p>
          </>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>N/D</p>
        )}
      </div>
    </button>
  )
}

/** Liste réutilisée portrait + paysage */
function StationList({
  stations, loading, fuelType, selectedId, apiError,
  onStationClick, onRetry, onChangeFuel,
}: {
  stations: Station[]; loading: boolean; fuelType: MapFuelType
  selectedId: string | null; apiError: string | null
  onStationClick: (s: Station) => void; onRetry: () => void; onChangeFuel: (f: MapFuelType) => void
}) {
  // Première station ayant effectivement un prix pour le carburant sélectionné
  const cheapest = stations.find((s) => getPriceForFuel(s, fuelType) !== undefined)

  return (
    <>
      {/* Erreur */}
      {apiError && (
        <div className="px-4 py-3">
          <div className="flex items-start gap-3 p-3 rounded-xl" style={{ backgroundColor: 'rgba(255,53,53,0.08)', border: '1px solid rgba(255,53,53,0.2)' }}>
            <AlertCircle size={14} style={{ color: 'var(--color-alert)', flexShrink: 0 }} />
            <div className="flex-1">
              <p className="text-xs font-semibold" style={{ color: 'var(--color-alert)' }}>Erreur</p>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{apiError}</p>
              <button onClick={onRetry} className="text-xs font-bold mt-1.5" style={{ color: 'var(--color-accent)' }}>Réessayer</button>
            </div>
          </div>
        </div>
      )}

      {/* Skeleton */}
      {loading && stations.length === 0 && (
        <div className="px-4 py-3 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-1" style={{ opacity: 1 - i * 0.15 }}>
              <div className="w-8 h-8 rounded-xl flex-shrink-0" style={{ backgroundColor: 'var(--color-surface-2)' }} />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 rounded-full" style={{ backgroundColor: 'var(--color-surface-2)', width: `${55 + i * 6}%` }} />
                <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--color-surface-2)', width: `${35 + i * 4}%` }} />
              </div>
              <div className="w-12 h-7 rounded-lg" style={{ backgroundColor: 'var(--color-surface-2)' }} />
            </div>
          ))}
        </div>
      )}

      {/* Vide */}
      {!loading && stations.length === 0 && !apiError && (
        <div className="flex flex-col items-center py-12 px-6 text-center">
          <Fuel size={36} className="mb-3" style={{ color: 'var(--color-muted)' }} />
          <p className="text-lg font-bold uppercase" style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}>
            Aucune station
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
            Pas de {MAP_FUEL_LABELS[fuelType]} dans la zone
          </p>
          <button onClick={() => onChangeFuel('sp95')} className="text-xs font-bold mt-3" style={{ color: 'var(--color-accent)' }}>
            Voir SP95
          </button>
        </div>
      )}

      {/* Carte meilleur prix — uniquement si au moins une station a un prix */}
      {cheapest && (
        <div
          className="mx-4 my-3 p-4 rounded-xl"
          style={{ background: 'linear-gradient(135deg, rgba(255,85,0,0.14) 0%, rgba(255,85,0,0.05) 100%)', border: '1.5px solid rgba(255,85,0,0.28)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--color-accent)' }}>
              <Fuel size={16} color="white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--color-accent)' }}>
                Moins chère
              </p>
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-content)' }}>
                {cheapest.nom || cheapest.adresse || 'Station'}
                {cheapest.ville ? ` · ${cheapest.ville}` : ''}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-3xl font-bold leading-none" style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-accent)' }}>
                {getPriceForFuel(cheapest, fuelType)!.toFixed(3)}
              </p>
              <p className="text-[9px]" style={{ color: 'var(--color-muted)' }}>€/L</p>
            </div>
          </div>
          {cheapest.distance !== undefined && (
            <div className="flex items-center gap-1.5 mt-2.5">
              <Navigation size={11} style={{ color: 'var(--color-info)' }} />
              <span className="text-xs" style={{ color: 'var(--color-info)' }}>
                {formatDistance(cheapest.distance)} de vous
              </span>
              {cheapest.adresse && (
                <span className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>
                  · {cheapest.adresse}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Liste */}
      {stations.map((st, i) => (
        <StationCard
          key={st.id} station={st} rank={i} fuelType={fuelType}
          selected={selectedId === st.id}
          onClick={() => onStationClick(st)}
        />
      ))}
    </>
  )
}

/** Chips de sélection carburant */
function FuelChips({ value, onChange }: { value: MapFuelType; onChange: (f: MapFuelType) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
      {FUEL_TYPES.map((ft) => (
        <button
          key={ft}
          onClick={() => onChange(ft)}
          className="flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all active:scale-95"
          style={{
            backgroundColor: value === ft ? 'var(--color-accent)' : 'var(--color-surface-2)',
            color: value === ft ? 'white' : 'var(--color-muted)',
            border: value === ft ? '1.5px solid var(--color-accent)' : '1.5px solid var(--color-border)',
            boxShadow: value === ft ? '0 2px 10px rgba(255,85,0,0.3)' : 'none',
          }}
        >
          {MAP_FUEL_LABELS[ft]}
        </button>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Page principale
───────────────────────────────────────────────────────────── */
export default function StationsPage() {
  const isLandscape = useIsLandscape()
  const isDark = useIsDark()
  const { settings } = useApp()

  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null)
  const [geoError, setGeoError] = useState(false)
  const [geoRequesting, setGeoRequesting] = useState(false)
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [fuelType, setFuelType] = useState<MapFuelType>(() => toMapFuelType(settings.fuelType))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek')
  const [isDragging, setIsDragging] = useState(false)
  const [isFollowingUser, setIsFollowingUser] = useState(false)
  const [recenterTrigger, setRecenterTrigger] = useState(0)
  const [invalidateTrigger, setInvalidateTrigger] = useState(0)

  const dragStartY = useRef<number | null>(null)
  const dragCurrentY = useRef<number>(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Sync carburant depuis les réglages ── */
  useEffect(() => {
    setFuelType(toMapFuelType(settings.fuelType))
  }, [settings.fuelType])

  /* ── Invalidate map on orientation change ── */
  useEffect(() => {
    setInvalidateTrigger((n) => n + 1)
    if (isLandscape) setSheetSnap('peek')
  }, [isLandscape])

  /* ── Géolocalisation ── */
  useEffect(() => {
    if (!navigator.geolocation) {
      setUserPos({ lat: 48.8566, lng: 2.3522 })
      setGeoError(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoError(false)
        setIsFollowingUser(true)
        // Recentre la carte sur la position réelle dès que le GPS répond
        setRecenterTrigger((n) => n + 1)
      },
      () => {
        setUserPos({ lat: 48.8566, lng: 2.3522 })
        setGeoError(true)
      },
      { timeout: 8000, enableHighAccuracy: true },
    )
  }, [])

  /* ── Fetch stations ── */
  const fetchStations = useCallback(
    async (pos: { lat: number; lng: number }, fuel: MapFuelType, radius = 15) => {
      setLoading(true)
      setApiError(null)
      try {
        const p = new URLSearchParams({
          lat: String(pos.lat),
          lng: String(pos.lng),
          radius: String(Math.min(radius, 30)),
          fuel,
        })
        const res = await fetch(`/api/stations?${p}`)
        const data = await res.json()
        if (data.error && !data.stations?.length) setApiError(data.error)
        // Le tri (prix ASC puis N/D par distance) est déjà effectué côté API route
        setStations(data.stations ?? [])
      } catch {
        setApiError('Erreur réseau')
        setStations([])
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (userPos) fetchStations(userPos, fuelType)
  }, [userPos, fuelType, fetchStations])

  /* ── Recherche dynamique à chaque déplacement ── */
  const handleBoundsChange = useCallback(
    (lat: number, lng: number, radius: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        fetchStations({ lat, lng }, fuelType, radius)
      }, 900)
    },
    [fuelType, fetchStations],
  )

  const handleMapMoved = useCallback(() => {
    setIsFollowingUser(false)
  }, [])

  /* ── Demande / re-demande de géolocalisation ── */
  const requestGeo = useCallback(() => {
    if (!navigator.geolocation || geoRequesting) return
    setGeoRequesting(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserPos(newPos)
        setGeoError(false)
        setIsFollowingUser(true)
        setRecenterTrigger((n) => n + 1)
        setGeoRequesting(false)
        fetchStations(newPos, fuelType)
      },
      () => {
        setGeoError(true)
        setGeoRequesting(false)
      },
      { timeout: 10000, enableHighAccuracy: true },
    )
  }, [geoRequesting, fuelType, fetchStations])

  /* ── Recentrer (ou demander permission si geoError) ── */
  const handleRecenter = useCallback(() => {
    if (geoError || !userPos) {
      requestGeo()
      return
    }
    setIsFollowingUser(true)
    setRecenterTrigger((n) => n + 1)
    fetchStations(userPos, fuelType)
  }, [geoError, userPos, fuelType, fetchStations, requestGeo])

  /* ── Station sélectionnée ── */
  const handleStationClick = useCallback((station: Station) => {
    setSelectedId((prev) => (prev === station.id ? null : station.id))
    if (!isLandscape) setSheetSnap('half')
  }, [isLandscape])

  /* ── Swipe bottom sheet ── */
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    dragCurrentY.current = e.touches[0].clientY
    setIsDragging(true)
  }, [])
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return
    dragCurrentY.current = e.touches[0].clientY
  }, [])
  const onTouchEnd = useCallback(() => {
    if (dragStartY.current === null) return
    const delta = dragCurrentY.current - dragStartY.current
    if (delta < -50) setSheetSnap((s) => s === 'peek' ? 'half' : 'full')
    else if (delta > 50) setSheetSnap((s) => s === 'full' ? 'half' : 'peek')
    dragStartY.current = null
    setIsDragging(false)
  }, [])

  const mapLat = userPos?.lat ?? 48.8566
  const mapLng = userPos?.lng ?? 2.3522

  /* ─────────────────────────────────────────────────────────
     Bouton recenter (flottant sur la carte)
  ───────────────────────────────────────────────────────── */
  const RecenterBtn = (
    <button
      onClick={handleRecenter}
      disabled={geoRequesting}
      title={
        geoRequesting ? 'Localisation en cours…'
        : geoError ? 'Activer la localisation'
        : 'Recentrer sur ma position'
      }
      className="w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-90"
      style={{
        backgroundColor: geoRequesting
          ? 'rgba(29,29,39,0.92)'
          : geoError
            ? 'rgba(255,60,0,0.12)'
            : isFollowingUser
              ? 'var(--color-accent)'
              : 'rgba(29,29,39,0.92)',
        border: geoError
          ? '1.5px solid rgba(255,60,0,0.35)'
          : isFollowingUser
            ? '2px solid rgba(255,255,255,0.2)'
            : '1.5px solid var(--color-border)',
        backdropFilter: 'blur(8px)',
        boxShadow: isFollowingUser && !geoError
          ? '0 4px 16px rgba(255,85,0,0.4)'
          : '0 2px 10px rgba(0,0,0,0.4)',
        opacity: geoRequesting ? 0.7 : 1,
      }}
    >
      {geoRequesting ? (
        <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-muted)' }} />
      ) : geoError ? (
        /* Icône GPS avec petit éclair indiquant "activer" */
        <div className="relative">
          <LocateFixed size={18} style={{ color: '#FF6644' }} strokeWidth={2} />
          <span
            className="absolute -top-1 -right-1 text-[8px] font-black leading-none"
            style={{ color: '#FF6644' }}
          >!</span>
        </div>
      ) : (
        <LocateFixed
          size={18}
          style={{ color: isFollowingUser ? 'white' : 'var(--color-muted)' }}
          strokeWidth={isFollowingUser ? 2.5 : 2}
        />
      )}
    </button>
  )

  const pricedCount = stations.filter((s) => getPriceForFuel(s, fuelType) !== undefined).length

  const statusText = loading
    ? 'Recherche…'
    : stations.length > 0
      ? pricedCount < stations.length
        ? `${stations.length} stations (${pricedCount} avec prix)`
        : `${stations.length} stations`
      : geoError
        ? 'Pos. non disponible'
        : 'Localisation…'

  /* ═══════════════════════════════════════════════════════
     MODE PAYSAGE
  ═════════════════════════════════════════════════════════ */
  if (isLandscape) {
    return (
      <div
        className="fixed inset-0 flex overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg)', zIndex: 0 }}
      >
        {/* Carte — padding gauche pour le notch/Dynamic Island en paysage */}
        <div
          className="flex-1 relative"
          style={{ minWidth: 0, paddingLeft: 'env(safe-area-inset-left, 0px)' }}
        >
          <StationsMap
            userLat={mapLat} userLng={mapLng}
            stations={stations} fuelType={fuelType} isDark={isDark}
            selectedId={selectedId} recenterTrigger={recenterTrigger}
            invalidateTrigger={invalidateTrigger}
            onStationClick={handleStationClick}
            onBoundsChange={handleBoundsChange}
            onMapMoved={handleMapMoved}
          />

          {/* Indicateur de recherche sur la carte */}
          {loading && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full z-20"
              style={{ backgroundColor: 'rgba(14,14,18,0.85)', backdropFilter: 'blur(8px)' }}
            >
              <Loader2 size={12} className="animate-spin" style={{ color: '#FF5500' }} />
              <span className="text-xs" style={{ color: '#EEEEF7' }}>Actualisation…</span>
            </div>
          )}

          {/* Bouton recenter (bas gauche — décalé du notch en paysage) */}
          <div
            className="absolute"
            style={{
              left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
              zIndex: 30,
            }}
          >
            {RecenterBtn}
          </div>
        </div>

        {/* Sidebar paysage */}
        <div
          className="flex-shrink-0 flex flex-col overflow-hidden"
          style={{
            width: '240px',
            backgroundColor: 'var(--color-surface)',
            borderLeft: '1px solid var(--color-border)',
            height: '100dvh',
          }}
        >
          {/* Header sidebar */}
          <div
            className="flex-shrink-0 px-3 pt-3 pb-2"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <h1
                  className="text-2xl font-bold uppercase tracking-widest leading-none"
                  style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-accent)' }}
                >
                  STATIONS
                </h1>
                <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{statusText}</p>
              </div>
              <div className="flex gap-1.5">
                {loading ? (
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
                ) : (
                  <button
                    onClick={() => userPos && fetchStations(userPos, fuelType)}
                    className="active:opacity-70"
                  >
                    <RefreshCw size={14} style={{ color: 'var(--color-muted)' }} />
                  </button>
                )}
                <Link href="/">
                  <ArrowLeft size={16} style={{ color: 'var(--color-muted)' }} />
                </Link>
              </div>
            </div>
            <FuelChips value={fuelType} onChange={setFuelType} />
          </div>

          {/* Liste scrollable */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 8px))' }}
          >
            <StationList
              stations={stations} loading={loading} fuelType={fuelType}
              selectedId={selectedId} apiError={apiError}
              onStationClick={handleStationClick}
              onRetry={() => userPos && fetchStations(userPos, fuelType)}
              onChangeFuel={setFuelType}
            />
          </div>
        </div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════
     MODE PORTRAIT (défaut)
  ═════════════════════════════════════════════════════════ */
  return (
    <div className="fixed inset-0 overflow-hidden" style={{ backgroundColor: '#0E0E12' }}>

      {/* Carte */}
      <div className="absolute inset-0" style={{ zIndex: 1 }}>
        <StationsMap
          userLat={mapLat} userLng={mapLng}
          stations={stations} fuelType={fuelType} isDark={isDark}
          selectedId={selectedId} recenterTrigger={recenterTrigger}
          invalidateTrigger={invalidateTrigger}
          onStationClick={handleStationClick}
          onBoundsChange={handleBoundsChange}
          onMapMoved={handleMapMoved}
        />
      </div>

      {/* Indicateur de recherche dynamique */}
      {loading && stations.length > 0 && (
        <div
          className="absolute top-24 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full z-25"
          style={{
            zIndex: 25,
            backgroundColor: 'rgba(14,14,18,0.88)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,85,0,0.2)',
          }}
        >
          <Loader2 size={11} className="animate-spin" style={{ color: '#FF5500' }} />
          <span className="text-xs font-medium" style={{ color: '#EEEEF7' }}>
            Actualisation de la zone…
          </span>
        </div>
      )}

      {/* Header overlay */}
      <div
        className="absolute top-0 left-0 right-0 z-20 px-4"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 44px)',
          paddingBottom: '14px',
          background: 'linear-gradient(to bottom, rgba(14,14,18,0.96) 55%, transparent)',
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(29,29,39,0.92)', backdropFilter: 'blur(8px)' }}
          >
            <ArrowLeft size={18} style={{ color: '#EEEEF7' }} />
          </Link>

          <div className="flex-1">
            <h1
              className="text-3xl font-bold uppercase tracking-widest leading-tight"
              style={{ fontFamily: 'var(--font-condensed)', color: '#FF5500' }}
            >
              STATIONS
            </h1>
            <p className="text-xs" style={{ color: '#6A6A82' }}>{statusText}</p>
          </div>

          {!loading ? (
            <button
              onClick={() => userPos && fetchStations(userPos, fuelType)}
              className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-transform"
              style={{ backgroundColor: 'rgba(29,29,39,0.92)', backdropFilter: 'blur(8px)' }}
            >
              <RefreshCw size={15} style={{ color: '#6A6A82' }} />
            </button>
          ) : (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(29,29,39,0.92)' }}>
              <Loader2 size={15} className="animate-spin" style={{ color: '#FF5500' }} />
            </div>
          )}
        </div>

        {geoError && (
          <div
            className="flex items-center gap-2 mt-2.5 px-3 py-2 rounded-xl"
            style={{ backgroundColor: 'rgba(255,53,53,0.1)', border: '1px solid rgba(255,53,53,0.25)' }}
          >
            <AlertCircle size={11} style={{ color: '#FF3535', flexShrink: 0 }} />
            <p className="text-xs" style={{ color: '#FF3535' }}>GPS désactivé — affichage autour de Paris</p>
          </div>
        )}
      </div>

      {/* Bouton recenter (au-dessus du sheet) */}
      <div
        className="absolute left-4 z-25 transition-all"
        style={{
          zIndex: 25,
          bottom: sheetSnap === 'peek' ? '162px' : sheetSnap === 'half' ? 'calc(52dvh + 12px)' : 'calc(85dvh + 12px)',
          transition: 'bottom 0.38s cubic-bezier(0.34, 1.15, 0.64, 1)',
        }}
      >
        {RecenterBtn}
      </div>

      {/* Bottom sheet */}
      <div
        className="absolute left-0 right-0 rounded-t-2xl overflow-hidden"
        style={{
          bottom: 0,
          height: '85dvh',
          zIndex: 30,
          backgroundColor: 'var(--color-surface)',
          transform: SNAP_PORTRAIT[sheetSnap],
          transition: isDragging ? 'none' : 'transform 0.38s cubic-bezier(0.34, 1.15, 0.64, 1)',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.5)',
          willChange: 'transform',
        }}
      >
        {/* Handle draggable */}
        <div
          className="flex flex-col items-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={() => setSheetSnap((s) => s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek')}
          style={{ userSelect: 'none' }}
        >
          <div className="w-10 h-1 rounded-full mb-2.5" style={{ backgroundColor: 'var(--color-muted)', opacity: 0.35 }} />
          <div className="w-full px-4 flex items-center justify-between">
            <div>
              <p
                className="text-xl font-bold uppercase tracking-wide"
                style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
              >
                {stations.length > 0 ? `${stations.length} stations proches` : loading ? 'Recherche…' : 'Aucune station'}
              </p>
              {stations.length > 0 && (
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  {pricedCount < stations.length
                    ? `${pricedCount} avec prix ${MAP_FUEL_LABELS[fuelType]} · ${stations.length - pricedCount} N/D`
                    : `Triées — ${MAP_FUEL_LABELS[fuelType]}`}
                </p>
              )}
            </div>
            {sheetSnap !== 'full'
              ? <ChevronUp size={18} style={{ color: 'var(--color-muted)' }} />
              : <ChevronDown size={18} style={{ color: 'var(--color-muted)' }} />
            }
          </div>
        </div>

        {/* Chips carburant */}
        <div className="px-4 pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <FuelChips value={fuelType} onChange={setFuelType} />
        </div>

        {/* Liste scrollable */}
        <div
          className="overflow-y-auto"
          style={{ height: 'calc(100% - 148px)', paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 8px))' }}
        >
          <StationList
            stations={stations} loading={loading} fuelType={fuelType}
            selectedId={selectedId} apiError={apiError}
            onStationClick={handleStationClick}
            onRetry={() => userPos && fetchStations(userPos, fuelType)}
            onChangeFuel={setFuelType}
          />
        </div>
      </div>
    </div>
  )
}
