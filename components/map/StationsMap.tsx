'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { Station, MapFuelType } from '@/lib/stationsTypes'
import { getPriceForFuel } from '@/lib/stationsTypes'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LType = any

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

interface Props {
  userLat: number
  userLng: number
  stations: Station[]
  fuelType: MapFuelType
  isDark: boolean
  selectedId?: string | null
  recenterTrigger?: number
  invalidateTrigger?: number
  onStationClick?: (station: Station) => void
  onBoundsChange?: (lat: number, lng: number, radiusKm: number) => void
  onMapMoved?: () => void
}

/* ─── Calcul du rayon depuis les bounds visibles ─── */
function boundsToRadius(map: LType): number {
  try {
    const bounds = map.getBounds()
    const center = bounds.getCenter()
    const ne = bounds.getNorthEast()
    const latDiff = Math.abs(ne.lat - center.lat)
    const lngDiff = Math.abs(ne.lng - center.lng)
    const latKm = latDiff * 111.32
    const lngKm = lngDiff * 111.32 * Math.cos((center.lat * Math.PI) / 180)
    return Math.min(Math.max(Math.ceil(Math.max(latKm, lngKm)) + 3, 5), 30)
  } catch {
    return 15
  }
}

/* ─── Marqueur prix ─── */
function markerHtml(price: number, rank: number, selected: boolean, isDark: boolean): string {
  const isFirst = rank === 0
  const isTop = rank < 4

  let bg: string
  let border: string
  let shadow: string
  let text: string

  if (selected || isFirst) {
    bg = '#FF5500'
    border = selected ? '#FF8844' : '#FF5500'
    shadow = '0 3px 14px rgba(255,85,0,0.55)'
    text = 'white'
  } else if (isTop) {
    bg = isDark ? '#1D1D27' : '#FFFFFF'
    border = '#29A9D1'
    shadow = isDark ? '0 2px 10px rgba(0,0,0,0.55)' : '0 2px 10px rgba(0,0,0,0.18)'
    text = isDark ? '#EEEEF7' : '#161410'
  } else {
    bg = isDark ? '#1D1D27' : '#FFFFFF'
    border = isDark ? '#2E2E3E' : '#D8D6D1'
    shadow = isDark ? '0 2px 8px rgba(0,0,0,0.45)' : '0 2px 8px rgba(0,0,0,0.12)'
    text = isDark ? '#6A6A82' : '#9A9880'
  }

  const unitColor =
    selected || isFirst
      ? 'rgba(255,255,255,0.65)'
      : isDark
        ? isTop
          ? 'rgba(238,238,247,0.5)'
          : 'rgba(106,106,130,0.7)'
        : isTop
          ? 'rgba(22,20,16,0.5)'
          : 'rgba(154,152,128,0.8)'

  return `<div style="
    background:${bg};
    border:2px solid ${border};
    border-radius:9px;
    padding:5px 9px 4px;
    position:relative;
    cursor:pointer;
    white-space:nowrap;
    box-shadow:${shadow};
    user-select:none;
  ">
    <div style="display:flex;align-items:baseline;gap:2px;">
      <span style="
        font-family:'Barlow Condensed',sans-serif;
        font-weight:700;font-size:15px;
        color:${text};
        letter-spacing:0.03em;line-height:1;
      ">${price.toFixed(3)}</span>
      <span style="
        font-family:'DM Sans',sans-serif;
        font-size:9px;color:${unitColor};font-weight:500;
      ">€/L</span>
    </div>
    <div style="
      position:absolute;bottom:-9px;left:50%;transform:translateX(-50%);
      width:0;height:0;
      border-left:7px solid transparent;
      border-right:7px solid transparent;
      border-top:9px solid ${bg};
    "></div>
  </div>`
}

/* ─── Marqueur sans prix (station présente mais prix inconnu) ─── */
function markerHtmlNoPrice(selected: boolean, isDark: boolean): string {
  const bg = isDark ? '#1D1D27' : '#FFFFFF'
  const border = selected
    ? '#FF8844'
    : isDark ? '#3A3A4E' : '#C8C6C1'
  const text = isDark ? '#4A4A60' : '#B0AE9A'
  const shadow = isDark ? '0 1px 6px rgba(0,0,0,0.5)' : '0 1px 6px rgba(0,0,0,0.1)'

  return `<div style="
    background:${bg};
    border:1.5px dashed ${border};
    border-radius:8px;
    padding:4px 8px 3px;
    position:relative;
    cursor:pointer;
    white-space:nowrap;
    box-shadow:${shadow};
    user-select:none;
    opacity:0.75;
  ">
    <span style="
      font-family:'DM Sans',sans-serif;
      font-size:10px;font-weight:600;
      color:${text};letter-spacing:0.02em;
    ">N/D</span>
    <div style="
      position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);
      width:0;height:0;
      border-left:5px solid transparent;
      border-right:5px solid transparent;
      border-top:7px solid ${border};
    "></div>
  </div>`
}

/* ─── Marqueur utilisateur ─── */
function userMarkerHtml(): string {
  return `<div style="
    width:18px;height:18px;
    background:#FF5500;
    border:3px solid rgba(255,85,0,0.2);
    border-radius:50%;
    box-shadow:0 0 0 8px rgba(255,85,0,0.1),0 2px 8px rgba(0,0,0,0.4);
  "></div>`
}

/* ─── Composant ─── */
export default function StationsMap({
  userLat,
  userLng,
  stations,
  fuelType,
  isDark,
  selectedId,
  recenterTrigger,
  invalidateTrigger,
  onStationClick,
  onBoundsChange,
  onMapMoved,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<{
    map: LType
    L: LType
    tileLayer: LType
    stationMarkers: LType[]
    userMarker: LType | null
  } | null>(null)
  // Ref pour accéder aux coords à jour sans déclencher le recenter sur chaque GPS update
  const coordsRef = useRef({ lat: userLat, lng: userLng })

  /* ── Init carte ── */
  useEffect(() => {
    if (!containerRef.current || stateRef.current) return
    let active = true

    const init = async () => {
      const Leaflet = (await import('leaflet')).default
      if (!active || !containerRef.current || stateRef.current) return

      const map = Leaflet.map(containerRef.current, {
        center: [userLat, userLng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
      })

      // Tuiles initiales
      const tileLayer = Leaflet.tileLayer(isDark ? DARK_TILES : LIGHT_TILES, {
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(map)

      // Attribution minimaliste
      Leaflet.control
        .attribution({
          position: 'bottomleft',
          prefix: '© CARTO · prix-carburants.gouv.fr',
        })
        .addTo(map)

      // Zoom compact en haut à droite
      Leaflet.control.zoom({ position: 'topright' }).addTo(map)

      // Marqueur utilisateur
      const userIcon = Leaflet.divIcon({
        className: '',
        html: userMarkerHtml(),
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      })
      const userMarker = Leaflet.marker([userLat, userLng], {
        icon: userIcon,
        zIndexOffset: 1000,
      }).addTo(map)

      stateRef.current = { map, L: Leaflet, tileLayer, stationMarkers: [], userMarker }

      // Événement moveend — recherche dynamique
      map.on('moveend', () => {
        const s = stateRef.current
        if (!s) return
        const center = s.map.getCenter()
        const radius = boundsToRadius(s.map)
        onBoundsChange?.(center.lat, center.lng, radius)
        onMapMoved?.()
      })
    }

    init()
    return () => {
      active = false
      if (stateRef.current) {
        stateRef.current.map.off()
        stateRef.current.map.remove()
        stateRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Échange de tuiles au changement de thème ── */
  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    const { map, L, tileLayer } = s
    map.removeLayer(tileLayer)
    const newTile = L.tileLayer(isDark ? DARK_TILES : LIGHT_TILES, {
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map)
    s.tileLayer = newTile
  }, [isDark])

  /* ── Recentrage ── */
  useEffect(() => {
    if (!recenterTrigger || !stateRef.current) return
    // Lit les coords depuis le ref pour avoir la valeur à jour sans re-trigger sur chaque GPS update
    const { lat, lng } = coordsRef.current
    stateRef.current.map.setView([lat, lng], 13, { animate: true, duration: 0.5 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterTrigger])

  /* ── Invalidate size (orientation change) ── */
  useEffect(() => {
    if (!invalidateTrigger || !stateRef.current) return
    setTimeout(() => stateRef.current?.map.invalidateSize(), 150)
  }, [invalidateTrigger])

  /* ── Mise à jour position utilisateur ── */
  useEffect(() => {
    coordsRef.current = { lat: userLat, lng: userLng }
    const s = stateRef.current
    if (!s) return
    if (s.userMarker) {
      s.userMarker.setLatLng([userLat, userLng])
    } else {
      const icon = s.L.divIcon({
        className: '',
        html: userMarkerHtml(),
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      })
      s.userMarker = s.L.marker([userLat, userLng], { icon, zIndexOffset: 1000 }).addTo(s.map)
    }
  }, [userLat, userLng])

  /* ── Marqueurs stations ── */
  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    s.stationMarkers.forEach((m) => m.remove())
    s.stationMarkers = []
    if (!stations.length) return

    const newMarkers: LType[] = []
    // Rang parmi les stations AVEC un prix (pour le style des marqueurs)
    let priceRank = 0

    stations.forEach((station) => {
      const price = getPriceForFuel(station, fuelType)
      const hasPrice = price !== undefined
      const isSelected = station.id === selectedId
      const rank = hasPrice ? priceRank : 999

      const icon = s.L.divIcon({
        className: '',
        html: hasPrice
          ? markerHtml(price!, rank, isSelected, isDark)
          : markerHtmlNoPrice(isSelected, isDark),
        iconSize: hasPrice ? [76, 38] : [46, 28],
        iconAnchor: hasPrice ? [38, 47] : [23, 35],
        popupAnchor: [0, hasPrice ? -52 : -38],
      })

      const marker = s.L.marker([station.lat, station.lng], {
        icon,
        zIndexOffset: isSelected ? 600 : hasPrice && rank === 0 ? 200 : hasPrice ? 10 : -10,
      })

      marker.on('click', () => onStationClick?.(station))

      // Popup Octrack-styled
      const surfBg = isDark ? '#1D1D27' : '#FFFFFF'
      const surfBorder = isDark ? 'rgba(255,85,0,0.2)' : 'rgba(224,72,0,0.15)'
      const textMain = isDark ? '#EEEEF7' : '#161410'
      const textSub = isDark ? '#6A6A82' : '#9A9880'
      const stationLabel = station.nom || station.adresse || 'Station'

      const priceHtml = hasPrice
        ? `<div style="font-size:13px;font-weight:700;color:#FF5500;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">${price!.toFixed(3)} €/L</div>`
        : `<div style="font-size:11px;font-weight:600;color:${textSub};margin-bottom:4px;">Prix non disponible</div>`

      marker.bindPopup(
        `<div style="
          font-family:'Barlow Condensed',sans-serif;
          background:${surfBg};color:${textMain};
          border-radius:10px;padding:10px 14px;min-width:160px;
          border:1px solid ${surfBorder};
        ">
          ${priceHtml}
          <div style="font-size:12px;font-weight:600;">${stationLabel}</div>
          ${station.ville ? `<div style="font-size:11px;color:${textSub};margin-top:2px;">${station.ville}</div>` : ''}
          ${station.distance !== undefined ? `<div style="font-size:11px;color:#29A9D1;margin-top:4px;">${station.distance < 1 ? Math.round(station.distance * 1000) + ' m' : station.distance.toFixed(1) + ' km'}</div>` : ''}
        </div>`,
        { className: 'octrack-popup', closeButton: false, offset: [0, -10] },
      )

      marker.addTo(s.map)
      newMarkers.push(marker)

      if (hasPrice) priceRank++
    })
    s.stationMarkers = newMarkers

    // Ajuste la vue
    if (newMarkers.length > 0 && !recenterTrigger) {
      try {
        const group = s.L.featureGroup([...newMarkers, ...(s.userMarker ? [s.userMarker] : [])])
        s.map.fitBounds(group.getBounds().pad(0.12), { maxZoom: 14, animate: true, duration: 0.5 })
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, fuelType, selectedId, isDark])

  /* ── Centrer sur station sélectionnée ── */
  useEffect(() => {
    const s = stateRef.current
    if (!s || !selectedId) return
    const station = stations.find((st) => st.id === selectedId)
    if (station) s.map.panTo([station.lat, station.lng], { animate: true, duration: 0.4 })
  }, [selectedId, stations])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
      className="stations-map"
    />
  )
}
