'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, PenLine, Zap, ScanLine, AlertCircle, Image as ImageIcon } from 'lucide-react'
import { useApp } from '@/components/AppContext'
import { FuelType, FUEL_TYPE_LABELS } from '@/lib/types'
import { OcrReviewOverlay } from '@/components/OcrReviewOverlay'
import { runOcr } from '@/lib/geminiOcr'
import type { OcrExtracted } from '@/lib/ocrExtract'
import type { OcrReviewValues } from '@/components/OcrReviewOverlay'

type Mode = 'camera' | 'manual'

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
  onSwitch,
  onOcrConfirm,
  defaultFuelType,
}: {
  onSwitch: () => void
  onOcrConfirm: (values: OcrReviewValues) => void
  defaultFuelType: FuelType
}) {
  const fileInputRef    = useRef<HTMLInputElement>(null)  // caméra (capture="environment")
  const galleryInputRef = useRef<HTMLInputElement>(null)  // pellicule (galerie photo)
  const [ocrPhase, setOcrPhase] = useState<OcrPhase>('idle')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [extracted, setExtracted] = useState<OcrExtracted>({})
  const [flash, setFlash] = useState(false)

  // Auto-ouvre la caméra dès que l'onglet Photo est affiché sur mobile.
  // Sur iOS Safari, un clic programmatique sur un <input file> est autorisé
  // si la chaîne d'appel remonte à une interaction utilisateur récente (< ~1s).
  // Le tap sur l'onglet "Photo" déclenche le rendu → useEffect → click dans la fenêtre tolérée.
  useEffect(() => {
    const isTouchDevice = typeof window !== 'undefined'
      && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
    if (!isTouchDevice) return  // sur desktop, le bouton shutter suffit

    const timeout = setTimeout(() => {
      fileInputRef.current?.click()
    }, 80) // délai minimal pour laisser le DOM se stabiliser
    return () => clearTimeout(timeout)
  }, []) // se déclenche une seule fois au montage du composant

  const triggerCapture = () => {
    setFlash(true)
    setTimeout(() => setFlash(false), 120)
    fileInputRef.current?.click()
  }

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input pour permettre une nouvelle sélection du même fichier
    e.target.value = ''

    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setProgress(0)
    setOcrPhase('processing')

    try {
      // Passer defaultFuelType pour le stocker dans la file offline (IndexedDB)
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
      {/* ── Input caméra caché (capture="environment" → ouvre directement l'appareil photo) ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelected}
        className="hidden"
        aria-hidden
      />

      {/* ── Input galerie caché (sans capture → ouvre la pellicule) ── */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
        className="hidden"
        aria-hidden
      />

      {/* ── Overlay OCR (processing + review) ── */}
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

      {/* ── Viewfinder ── */}
      <div className="flex flex-col" style={{ height: 'calc(100dvh - 140px)' }}>
        <div
          className="relative flex-1 overflow-hidden rounded-2xl"
          style={{ backgroundColor: '#0A0A0D' }}
        >
          {/* Fond gradient */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(10,10,15,0.8) 0%, rgba(20,20,30,0.6) 40%, rgba(10,10,15,0.9) 100%)',
            }}
          />

          {/* Grid overlay */}
          <svg className="absolute inset-0 w-full h-full opacity-10" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="33" y1="0" x2="33" y2="100" stroke="white" strokeWidth="0.3" />
            <line x1="66" y1="0" x2="66" y2="100" stroke="white" strokeWidth="0.3" />
            <line x1="0" y1="33" x2="100" y2="33" stroke="white" strokeWidth="0.3" />
            <line x1="0" y1="66" x2="100" y2="66" stroke="white" strokeWidth="0.3" />
          </svg>

          {/* Cadre scan */}
          <div className="absolute inset-8 flex items-center justify-center">
            <div className="relative w-full max-w-[260px] h-44">
              {[
                { pos: { top: 0, left: 0 },     bt: true,  bl: true,  bb: false, br: false },
                { pos: { top: 0, right: 0 },    bt: true,  bl: false, bb: false, br: true  },
                { pos: { bottom: 0, left: 0 },  bt: false, bl: true,  bb: true,  br: false },
                { pos: { bottom: 0, right: 0 }, bt: false, bl: false, bb: true,  br: true  },
              ].map((corner, i) => (
                <div
                  key={i}
                  className="absolute w-6 h-6"
                  style={{
                    ...corner.pos,
                    borderColor: 'var(--color-accent)',
                    borderTopWidth: corner.bt ? '3px' : '0',
                    borderLeftWidth: corner.bl ? '3px' : '0',
                    borderBottomWidth: corner.bb ? '3px' : '0',
                    borderRightWidth: corner.br ? '3px' : '0',
                    borderStyle: 'solid',
                    filter: 'drop-shadow(0 0 4px var(--color-accent))',
                  }}
                />
              ))}

              {/* Scan line animée */}
              <div
                className="absolute left-0 right-0 h-px"
                style={{
                  background: 'linear-gradient(90deg, transparent, var(--color-accent), transparent)',
                  animation: 'scanLine 2s ease-in-out infinite',
                }}
              />

              {/* Labels zones */}
              <div className="absolute -bottom-7 left-0 right-0 flex justify-between">
                <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
                  Prix/L
                </span>
                <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
                  Total
                </span>
              </div>
            </div>
          </div>

          {/* Hint top */}
          <div className="absolute top-4 left-0 right-0 flex items-center justify-center">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
              style={{
                backgroundColor: 'rgba(0,0,0,0.6)',
                color: 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <ScanLine size={12} />
              <span>Cadrez l&apos;afficheur de la pompe</span>
            </div>
          </div>

          {/* Badge Gemini */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
              style={{
                backgroundColor: 'rgba(255,107,0,0.12)',
                border: '1px solid rgba(255,107,0,0.25)',
                color: 'rgba(255,255,255,0.6)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{
                  background: 'radial-gradient(circle, #FF8800 0%, #FF4400 100%)',
                  boxShadow: '0 0 6px rgba(255,107,0,0.6)',
                }}
              />
              <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Gemini Vision
              </span>
            </div>
          </div>

          {/* Flash */}
          {flash && (
            <div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{ backgroundColor: 'white', opacity: 0.6 }}
            />
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-8 pt-5 pb-2">
          <button
            onClick={onSwitch}
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-surface)' }}
          >
            <PenLine size={18} style={{ color: 'var(--color-muted)' }} />
          </button>

          {/* Shutter */}
          <button
            onClick={triggerCapture}
            className="w-20 h-20 rounded-full flex items-center justify-center transition-transform active:scale-95"
            style={{
              border: '4px solid var(--color-accent)',
              backgroundColor: 'transparent',
              boxShadow: '0 0 24px rgba(255,85,0,0.3)',
            }}
          >
            <div
              className="w-14 h-14 rounded-full"
              style={{ backgroundColor: 'var(--color-accent)' }}
            />
          </button>

          {/* Bouton Pellicule — ouvre la galerie photo */}
          <button
            onClick={() => galleryInputRef.current?.click()}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{
              backgroundColor: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
            aria-label="Choisir depuis la pellicule"
          >
            <ImageIcon size={18} style={{ color: 'rgba(255,255,255,0.55)' }} />
          </button>
        </div>

        <p className="text-center text-[10px] pb-1 uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
          Photo ou pellicule — analyse Gemini instantanée
        </p>
      </div>

      <style>{`
        @keyframes scanLine {
          0%, 100% { top: 0; opacity: 0; }
          10%       { opacity: 1; }
          90%       { opacity: 1; }
          100%      { top: 100%; opacity: 0; }
        }
      `}</style>
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

  const Field = ({
    label,
    field,
    type = 'text',
    placeholder,
    unit,
  }: {
    label: string
    field: keyof FormData
    type?: string
    placeholder?: string
    unit?: string
  }) => (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-muted)' }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          value={form[field]}
          onChange={(e) => update(field, e.target.value)}
          placeholder={placeholder}
          className="input-field"
          style={unit ? { paddingRight: '48px' } : {}}
        />
        {unit && (
          <span
            className="absolute right-4 top-1/2 -translate-y-1/2 text-sm"
            style={{ color: 'var(--color-muted)' }}
          >
            {unit}
          </span>
        )}
      </div>
      {errors[field] && (
        <p className="flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--color-alert)' }}>
          <AlertCircle size={11} />
          {errors[field]}
        </p>
      )}
    </div>
  )

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

        <Field label="Date" field="date" type="date" />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Litres" field="liters" type="number" placeholder="42.5" unit="L" />
          <Field label="Prix/Litre" field="pricePerLiter" type="number" placeholder="1.799" unit="€" />
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

        <Field label="Kilométrage" field="km" type="number" placeholder="87 340" unit="km" />
        <Field label="Station" field="station" placeholder="Total, BP, Shell…" />
        <Field label="Notes" field="notes" placeholder="Autoroute A6, promotions…" />
      </div>

      <button onClick={handleSubmit} className="btn-primary">
        Enregistrer ce plein
      </button>
    </div>
  )
}

export default function AddPage() {
  const router = useRouter()
  const { settings } = useApp()
  const [mode, setMode] = useState<Mode>('camera')
  const [prefill, setPrefill] = useState<Partial<FormData> | undefined>()

  // Quand l'OCR confirme → pré-remplir le formulaire et basculer en mode manuel
  const handleOcrConfirm = useCallback((values: OcrReviewValues) => {
    setPrefill({
      liters: values.liters,
      pricePerLiter: values.pricePerLiter,
      totalCost: values.totalCost,
      fuelType: values.fuelType,
    })
    setMode('manual')
  }, [])

  return (
    <div className="px-4 pt-12 page-enter">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
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
            Nouveau plein
          </h1>
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

      {/* Mode toggle */}
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

      {mode === 'camera' ? (
        <CameraCaptureUI
          onSwitch={() => setMode('manual')}
          onOcrConfirm={handleOcrConfirm}
          defaultFuelType={settings.fuelType}
        />
      ) : (
        <ManualEntry
          onSuccess={() => router.push('/')}
          prefill={prefill}
        />
      )}
    </div>
  )
}
