'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, PenLine, Zap, AlertCircle, Image as ImageIcon, Scan, Sparkles, MapPin, CheckCircle2 } from 'lucide-react'
import { useApp } from '@/components/AppContext'
import { FuelType, FUEL_TYPE_LABELS } from '@/lib/types'
import { OcrReviewOverlay } from '@/components/OcrReviewOverlay'
import { runOcr } from '@/lib/geminiOcr'
import type { OcrExtracted } from '@/lib/ocrExtract'
import type { OcrReviewValues } from '@/components/OcrReviewOverlay'
import type { Station, MapFuelType } from '@/lib/stationsTypes'
import { formatDistance } from '@/lib/stationsTypes'

type Mode = 'camera' | 'manual' | 'confirm'

// ─── FormField — composant TOP-LEVEL (ne JAMAIS définir à l'intérieur d'un autre
//     composant : React verrait un nouveau type à chaque render → unmount → perte de focus)
interface FormFieldProps {
  label: string
  field: keyof FormData
  type?: string
  placeholder?: string
  unit?: string
  value: string
  error?: string
  onUpdate: (field: keyof FormData, value: string) => void
}
function FormField({ label, field, type = 'text', placeholder, unit, value, error, onUpdate }: FormFieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          value={value}
          onChange={(e) => onUpdate(field, e.target.value)}
          placeholder={placeholder}
          className="input-field"
          style={unit ? { paddingRight: '48px' } : {}}
        />
        {unit && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--color-muted)' }}>
            {unit}
          </span>
        )}
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--color-alert)' }}>
          <AlertCircle size={11} />
          {error}
        </p>
      )}
    </div>
  )
}

interface FormData {
  date: string
  liters: string
  pricePerLiter: string
  totalCost: string
  km: string
  station: string
  notes: string
  fuelType: FuelType
}

type OcrPhase = 'idle' | 'processing' | 'review'

function CameraCaptureUI({
  onOcrConfirm,
  defaultFuelType,
}: {
  onOcrConfirm: (values: OcrReviewValues) => void
  defaultFuelType: FuelType
}) {
  const fileInputRef    = useRef<HTMLInputElement>(null)  // caméra (capture="environment")
  const galleryInputRef = useRef<HTMLInputElement>(null)  // pellicule (galerie photo)
  const [ocrPhase, setOcrPhase] = useState<OcrPhase>('idle')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [extracted, setExtracted] = useState<OcrExtracted>({})

  // Auto-ouvre la caméra dès que l'onglet Photo est affiché sur mobile.
  useEffect(() => {
    const isTouchDevice = typeof window !== 'undefined'
      && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
    if (!isTouchDevice) return

    const timeout = setTimeout(() => {
      fileInputRef.current?.click()
    }, 80)
    return () => clearTimeout(timeout)
  }, [])

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    e.target.value = ''

    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setProgress(0)
    setOcrPhase('processing')

    try {
      const result = await runOcr(url, setProgress, defaultFuelType)
      setExtracted(result)
      setOcrPhase('review')
    } catch (err) {
      console.error('[OCR] error:', err)
      setExtracted({})
      setOcrPhase('review')
    }
  }, [defaultFuelType])

  const handleRetry = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(null)
    setExtracted({})
    setOcrPhase('idle')
    setTimeout(() => fileInputRef.current?.click(), 50)
  }

  const handleClose = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(null)
    setExtracted({})
    setOcrPhase('idle')
  }

  return (
    <>
      {/* Inputs cachés */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelected}
        className="hidden"
        aria-hidden
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
        className="hidden"
        aria-hidden
      />

      {/* Overlay OCR */}
      {(ocrPhase === 'processing' || ocrPhase === 'review') && imageUrl && (
        <OcrReviewOverlay
          imageUrl={imageUrl}
          phase={ocrPhase}
          extracted={extracted}
          progress={progress}
          defaultFuelType={defaultFuelType}
          onConfirm={(values) => {
            handleClose()
            onOcrConfirm(values)
          }}
          onRetry={handleRetry}
          onClose={handleClose}
        />
      )}

      {/* ── Interface de scan épurée ── */}
      <div className="flex flex-col gap-4 pt-2">

        {/* Bouton principal — Prendre une photo */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="relative flex items-center gap-4 w-full rounded-2xl p-5 text-left transition-all active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, rgba(255,85,0,0.18) 0%, rgba(255,85,0,0.08) 100%)',
            border: '1.5px solid rgba(255,85,0,0.35)',
            boxShadow: '0 4px 24px rgba(255,85,0,0.12)',
          }}
        >
          {/* Icône */}
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--color-accent)', boxShadow: '0 4px 16px rgba(255,85,0,0.4)' }}
          >
            <Scan size={24} color="white" />
          </div>

          {/* Texte */}
          <div className="flex-1 min-w-0">
            <p
              className="text-lg font-bold uppercase tracking-wide leading-tight"
              style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
            >
              Scanner la pompe
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              Pointe ton appareil vers l&apos;afficheur
            </p>
          </div>

          {/* Badge Gemini */}
          <div
            className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{
              backgroundColor: 'rgba(255,85,0,0.12)',
              border: '1px solid rgba(255,85,0,0.25)',
            }}
          >
            <Sparkles size={11} style={{ color: 'var(--color-accent)' }} />
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.55)',
              }}
            >
              AI
            </span>
          </div>
        </button>

        {/* Bouton secondaire — Depuis la galerie */}
        <button
          onClick={() => galleryInputRef.current?.click()}
          className="flex items-center gap-4 w-full rounded-2xl p-4 text-left transition-all active:scale-[0.98]"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1.5px solid var(--color-border)',
          }}
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--color-surface-2)' }}
          >
            <ImageIcon size={20} style={{ color: 'var(--color-muted)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-content)' }}>
              Depuis la galerie
            </p>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Choisir une photo existante
            </p>
          </div>
        </button>

        {/* Séparateur */}
        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
          <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
            comment ça marche
          </span>
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
        </div>

        {/* Étapes */}
        {[
          { n: '1', text: 'Prends une photo de l\'afficheur numérique de la pompe' },
          { n: '2', text: 'Gemini Vision lit les chiffres automatiquement' },
          { n: '3', text: 'Vérifie et enregistre en un tap' },
        ].map(({ n, text }) => (
          <div key={n} className="flex items-start gap-3 px-1">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold"
              style={{
                backgroundColor: 'rgba(255,85,0,0.12)',
                color: 'var(--color-accent)',
                border: '1px solid rgba(255,85,0,0.25)',
              }}
            >
              {n}
            </div>
            <p className="text-sm leading-snug" style={{ color: 'var(--color-muted)' }}>
              {text}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}

function ManualEntry({
  onSuccess,
  prefill,
}: {
  onSuccess: () => void
  prefill?: Partial<FormData>
}) {
  const { addFillUp, settings } = useApp()

  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState<FormData>({
    date: today,
    liters: prefill?.liters ?? '',
    pricePerLiter: prefill?.pricePerLiter ?? '',
    totalCost: prefill?.totalCost ?? '',
    km: prefill?.km ?? '',
    station: prefill?.station ?? '',
    notes: prefill?.notes ?? '',
    fuelType: prefill?.fuelType ?? settings.fuelType,
  })
  const [errors, setErrors] = useState<Partial<FormData>>({})
  const [autoTotal, setAutoTotal] = useState(true)

  const update = useCallback(
    (field: keyof FormData, value: string) => {
      setForm((prev) => {
        const next = { ...prev, [field]: value }
        if (autoTotal && (field === 'liters' || field === 'pricePerLiter')) {
          const l = parseFloat(next.liters)
          const p = parseFloat(next.pricePerLiter)
          if (!isNaN(l) && !isNaN(p)) {
            next.totalCost = (l * p).toFixed(2)
          }
        }
        if (field === 'totalCost') setAutoTotal(false)
        return next
      })
      setErrors((e) => ({ ...e, [field]: undefined }))
    },
    [autoTotal],
  )

  const validate = () => {
    const errs: Partial<FormData> = {}
    if (!form.date) errs.date = 'Requis'
    if (!form.liters || isNaN(parseFloat(form.liters))) errs.liters = 'Requis'
    if (!form.pricePerLiter || isNaN(parseFloat(form.pricePerLiter))) errs.pricePerLiter = 'Requis'
    if (!form.totalCost || isNaN(parseFloat(form.totalCost))) errs.totalCost = 'Requis'
    return errs
  }

  const handleSubmit = () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    addFillUp({
      date: form.date,
      liters: parseFloat(form.liters),
      pricePerLiter: parseFloat(form.pricePerLiter),
      totalCost: parseFloat(form.totalCost),
      km: form.km ? parseFloat(form.km) : undefined,
      station: form.station || undefined,
      notes: form.notes || undefined,
      fuelType: form.fuelType,
    })
    onSuccess()
  }

  return (
    <div className="space-y-5 pb-4">
      {/* Section principale */}
      <div className="card p-5 space-y-4">
        <p
          className="text-sm font-bold uppercase tracking-widest"
          style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-accent)' }}
        >
          Données plein
        </p>

        <FormField label="Date" field="date" type="date"
          value={form.date} error={errors.date} onUpdate={update} />

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Litres" field="liters" type="number" placeholder="42.5" unit="L"
            value={form.liters} error={errors.liters} onUpdate={update} />
          <FormField label="Prix/Litre" field="pricePerLiter" type="number" placeholder="1.799" unit="€"
            value={form.pricePerLiter} error={errors.pricePerLiter} onUpdate={update} />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>
            Coût total
          </label>
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              value={form.totalCost}
              onChange={(e) => update('totalCost', e.target.value)}
              placeholder="76.22"
              className="input-field"
              style={{ paddingRight: '48px' }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--color-muted)' }}>
              €
            </span>
          </div>
          {autoTotal && form.totalCost && (
            <p className="flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--color-positive)' }}>
              <Zap size={10} />
              Calculé automatiquement
            </p>
          )}
          {errors.totalCost && (
            <p className="flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--color-alert)' }}>
              <AlertCircle size={11} />
              {errors.totalCost}
            </p>
          )}
        </div>

        {/* Type carburant */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>
            Carburant
          </label>
          <select
            value={form.fuelType}
            onChange={(e) => update('fuelType', e.target.value)}
            className="input-field"
          >
            {Object.entries(FUEL_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Section optionnelle */}
      <div className="card p-5 space-y-4">
        <p className="text-sm font-bold uppercase tracking-widest" style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-muted)' }}>
          Infos optionnelles
        </p>

        <FormField label="Kilométrage" field="km" type="number" placeholder="87 340" unit="km"
          value={form.km} error={errors.km} onUpdate={update} />
        <FormField label="Station" field="station" placeholder="Total, BP, Shell…"
          value={form.station} error={errors.station} onUpdate={update} />
        <FormField label="Notes" field="notes" placeholder="Autoroute A6, promotions…"
          value={form.notes} error={errors.notes} onUpdate={update} />
      </div>

      <button onClick={handleSubmit} className="btn-primary">
        Enregistrer ce plein
      </button>
    </div>
  )
}

// ─── Composant ConfirmEntry (one-tap après OCR) ───────────────────────────────

function ConfirmEntry({
  values,
  nearestStation,
  stationLoading,
  onSave,
  onEdit,
}: {
  values: OcrReviewValues
  nearestStation: Station | null
  stationLoading: boolean
  onSave: (stationName?: string) => void
  onEdit: () => void
}) {
  const [stationOverride, setStationOverride] = useState<string>(
    (nearestStation?.nom || nearestStation?.adresse) ?? '',
  )

  // Mettre à jour le champ station quand la détection GPS revient
  useEffect(() => {
    if (nearestStation && !stationOverride) {
      setStationOverride(nearestStation.nom || nearestStation.adresse || '')
    }
  }, [nearestStation, stationOverride])

  const liters = parseFloat(values.liters) || 0
  const total  = parseFloat(values.totalCost) || 0
  const ppl    = parseFloat(values.pricePerLiter) || 0

  return (
    <div className="space-y-4 pb-4">
      {/* Bandeau OCR */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
        style={{
          backgroundColor: 'rgba(0,230,118,0.08)',
          border: '1px solid rgba(0,230,118,0.2)',
        }}
      >
        <Sparkles size={13} style={{ color: '#00E676', flexShrink: 0 }} />
        <p className="text-xs font-semibold" style={{ color: '#00E676' }}>
          Gemini Vision — données extraites
        </p>
      </div>

      {/* Valeurs extraites */}
      <div className="card divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {[
          { label: 'Litres', value: liters > 0 ? `${liters.toFixed(2)} L` : '—', accent: false },
          { label: 'Prix/litre', value: ppl > 0 ? `${ppl.toFixed(3)} €/L` : '—', accent: false },
          { label: 'Total', value: total > 0 ? `${total.toFixed(2)} €` : '—', accent: true },
        ].map(({ label, value, accent }) => (
          <div key={label} className="flex items-center justify-between px-5 py-4">
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>{label}</span>
            <span
              className="text-xl font-bold"
              style={{
                fontFamily: 'var(--font-condensed)',
                color: accent ? 'var(--color-accent)' : 'var(--color-content)',
              }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Station auto-détectée */}
      <div className="card p-4">
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted)' }}>
          <MapPin size={11} />
          Station
          {stationLoading && (
            <span className="text-[10px] normal-case tracking-normal font-normal" style={{ color: 'var(--color-info)' }}>
              Détection GPS…
            </span>
          )}
          {nearestStation && !stationLoading && (
            <span className="text-[10px] normal-case tracking-normal font-normal" style={{ color: '#00E676' }}>
              Auto-détectée{nearestStation.distance !== undefined ? ` · ${formatDistance(nearestStation.distance)}` : ''}
            </span>
          )}
        </label>
        <input
          type="text"
          value={stationOverride}
          onChange={(e) => setStationOverride(e.target.value)}
          placeholder="Total, BP, Shell…"
          className="input-field"
        />
      </div>

      {/* Bouton principal */}
      <button
        onClick={() => onSave(stationOverride || undefined)}
        className="btn-primary flex items-center justify-center gap-2"
      >
        <CheckCircle2 size={17} />
        Enregistrer ce plein
      </button>

      {/* Lien édition complète */}
      <button
        onClick={onEdit}
        className="w-full text-center text-sm py-2"
        style={{ color: 'var(--color-muted)' }}
      >
        Modifier les valeurs
      </button>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function AddPage() {
  const router = useRouter()
  const { settings, addFillUp } = useApp()
  const [mode, setMode] = useState<Mode>('camera')
  const [prefill, setPrefill] = useState<Partial<FormData> | undefined>()
  const [ocrValues, setOcrValues] = useState<OcrReviewValues | null>(null)
  const [nearestStation, setNearestStation] = useState<Station | null>(null)
  const [stationLoading, setStationLoading] = useState(false)

  // ── Détection GPS de la station la plus proche ────────────────────────────
  const detectNearestStation = useCallback(async (fuelType: FuelType) => {
    if (!navigator.geolocation) return
    setStationLoading(true)

    const mapFuel: Record<string, MapFuelType> = {
      sp95: 'sp95', sp98: 'sp98', e10: 'e10',
      diesel: 'gazole', gazole: 'gazole',
      e85: 'e85', gpl: 'gplc', gplc: 'gplc',
    }
    const fuel: MapFuelType = (mapFuel[fuelType] ?? 'sp95') as MapFuelType

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const p = new URLSearchParams({
            lat: String(pos.coords.latitude),
            lng: String(pos.coords.longitude),
            radius: '5',
            fuel,
          })
          const res  = await fetch(`/api/stations?${p}`)
          const data = await res.json()
          const first: Station | undefined = data.stations?.[0]
          if (first) setNearestStation(first)
        } catch { /* Non bloquant */ }
        setStationLoading(false)
      },
      () => setStationLoading(false),
      { timeout: 6000, enableHighAccuracy: false },
    )
  }, [])

  // Quand l'OCR confirme → mode confirm + GPS
  const handleOcrConfirm = useCallback((values: OcrReviewValues) => {
    setOcrValues(values)
    setPrefill({
      liters:        values.liters,
      pricePerLiter: values.pricePerLiter,
      totalCost:     values.totalCost,
      fuelType:      values.fuelType,
    })
    setMode('confirm')
    detectNearestStation(values.fuelType)
  }, [detectNearestStation])

  // One-tap save depuis le mode confirm
  const handleConfirmSave = useCallback((stationName?: string) => {
    if (!ocrValues) return
    addFillUp({
      date:          new Date().toISOString().split('T')[0],
      liters:        parseFloat(ocrValues.liters)        || 0,
      pricePerLiter: parseFloat(ocrValues.pricePerLiter) || 0,
      totalCost:     parseFloat(ocrValues.totalCost)     || 0,
      fuelType:      ocrValues.fuelType,
      station:       stationName || undefined,
    })
    router.push('/')
  }, [ocrValues, addFillUp, router])

  // Titre selon le mode
  const title =
    mode === 'confirm' ? 'Confirmer' :
    mode === 'manual'  ? 'Saisie manuelle' :
                         'Nouveau plein'

  return (
    <div className="px-4 pt-12 page-enter pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            if (mode === 'confirm' || mode === 'manual') {
              setMode('camera')
            } else {
              router.back()
            }
          }}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <ArrowLeft size={18} style={{ color: 'var(--color-content)' }} />
        </button>
        <div>
          <h1
            className="text-2xl font-bold uppercase tracking-wide"
            style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
          >
            {title}
          </h1>
          {mode === 'confirm' && (
            <p
              className="text-[10px] uppercase tracking-widest flex items-center gap-1"
              style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-condensed)' }}
            >
              <Zap size={9} />
              Pré-rempli par OCR
            </p>
          )}
          {mode === 'manual' && prefill?.liters && (
            <p
              className="text-[10px] uppercase tracking-widest flex items-center gap-1"
              style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-condensed)' }}
            >
              <Zap size={9} />
              Pré-rempli par OCR
            </p>
          )}
        </div>
      </div>

      {/* Mode toggle — masqué en mode confirm */}
      {mode !== 'confirm' && (
        <div
          className="flex rounded-xl p-1 mb-5"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <button
            onClick={() => setMode('camera')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              backgroundColor: mode === 'camera' ? 'var(--color-accent)' : 'transparent',
              color: mode === 'camera' ? 'white' : 'var(--color-muted)',
            }}
          >
            <Camera size={15} />
            Photo
          </button>
          <button
            onClick={() => setMode('manual')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              backgroundColor: mode === 'manual' ? 'var(--color-accent)' : 'transparent',
              color: mode === 'manual' ? 'white' : 'var(--color-muted)',
            }}
          >
            <PenLine size={15} />
            Manuel
          </button>
        </div>
      )}

      {mode === 'camera' && (
        <CameraCaptureUI
          onOcrConfirm={handleOcrConfirm}
          defaultFuelType={settings.fuelType}
        />
      )}

      {mode === 'confirm' && ocrValues && (
        <ConfirmEntry
          values={ocrValues}
          nearestStation={nearestStation}
          stationLoading={stationLoading}
          onSave={handleConfirmSave}
          onEdit={() => setMode('manual')}
        />
      )}

      {mode === 'manual' && (
        <ManualEntry
          onSuccess={() => router.push('/')}
          prefill={prefill}
        />
      )}
    </div>
  )
}
