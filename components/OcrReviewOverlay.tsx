'use client'

/**
 * Octrack — OcrReviewOverlay
 * Overlay de revue OCR Gemini Vision.
 *
 * Changements vs version Tesseract :
 *   - Loader industriel "GEMINI VISION" avec stages de progression
 *   - Bannière orange "ANALYSE DIFFÉRÉE" en mode hors-ligne
 *   - Suppression de tous les outils debug Tesseract (Terminal, Lentille IA, Bbox, Inverter)
 *   - Confiance toujours ≥ 0.93 quand Gemini a répondu
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, RotateCcw, Check, AlertTriangle, WifiOff, Gauge } from 'lucide-react'
import { mathCheck } from '@/lib/ocrExtract'
import type { OcrExtracted } from '@/lib/ocrExtract'
import type { FuelType } from '@/lib/types'

// ── Types publics ─────────────────────────────────────────────────────────────

export interface OcrReviewValues {
  liters: string
  pricePerLiter: string
  totalCost: string
  fuelType: FuelType
}

interface OcrReviewOverlayProps {
  imageUrl: string
  phase: 'processing' | 'review'
  extracted: OcrExtracted
  progress: number    // 0-100
  defaultFuelType: FuelType
  onConfirm: (values: OcrReviewValues) => void
  onRetry: () => void
  onClose: () => void
}

// ── Confidence dot ────────────────────────────────────────────────────────────

function ConfDot({ conf }: { conf?: number }) {
  const color = !conf || conf < 0.5 ? '#FF4422' : conf < 0.75 ? '#FF8833' : '#00E676'
  const label = !conf || conf < 0.5 ? 'Non détecté' : conf < 0.75 ? 'Incertain' : 'Détecté'
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full"
      style={{
        backgroundColor: `${color}18`,
        color,
        fontFamily: 'var(--font-condensed)',
        border: `1px solid ${color}40`,
      }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

// ── Champ éditable ────────────────────────────────────────────────────────────

function ReviewField({
  label, unit, value, conf, onChange,
}: {
  label: string; unit: string; value: string; conf?: number; onChange: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const isEmpty = !value || value === '0'

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  return (
    <div
      className="px-5 py-4 flex items-center justify-between gap-3"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex-shrink-0">
        <p className="text-[10px] uppercase tracking-[0.18em] mb-1"
          style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-condensed)' }}>
          {label}
        </p>
        <ConfDot conf={isEmpty ? 0 : conf} />
      </div>

      <div className="flex items-baseline gap-1 cursor-pointer" onClick={() => setEditing(true)}>
        {editing ? (
          <input
            ref={inputRef}
            type="number" inputMode="decimal" value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
            autoFocus
            className="text-right bg-transparent outline-none border-b-2"
            style={{ width: '100px', fontSize: '28px', fontFamily: 'var(--font-condensed)',
              fontWeight: 900, color: 'white', borderColor: 'var(--color-accent, #FF5500)',
              letterSpacing: '-0.02em' }}
          />
        ) : (
          <span className="font-black"
            style={{ fontSize: '28px', fontFamily: 'var(--font-condensed)',
              color: isEmpty ? 'rgba(255,255,255,0.2)' : 'white', letterSpacing: '-0.02em',
              transition: 'color 0.3s' }}>
            {isEmpty ? '—' : value}
          </span>
        )}
        <span className="text-sm font-bold mb-0.5"
          style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-condensed)' }}>
          {unit}
        </span>
        {!editing && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="ml-1 mb-0.5 opacity-30">
            <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="white" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
    </div>
  )
}

// ── Loader Gemini — industriel Octane ─────────────────────────────────────────

function GeminiLoader({ progress }: { progress: number }) {
  const stage = progress < 35 ? 0 : progress < 82 ? 1 : 2

  const stages = [
    { icon: '↑', label: 'Transfert image' },
    { icon: '◈', label: 'Analyse IA'       },
    { icon: '↗', label: 'Extraction'       },
  ]

  return (
    <div className="flex flex-col items-center justify-center h-full gap-7 px-8">
      {/* Logo Gemini stylisé */}
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(255,107,0,0.15) 0%, rgba(255,50,0,0.08) 100%)',
            border: '1px solid rgba(255,107,0,0.3)',
            boxShadow: '0 0 32px rgba(255,85,0,0.15)',
            animation: 'geminiPulse 2s ease-in-out infinite',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path
              d="M14 3 C14 3, 22 8, 22 14 C22 20, 14 25, 14 25 C14 25, 6 20, 6 14 C6 8, 14 3, 14 3Z"
              stroke="#FF6B00" strokeWidth="1.5" fill="none"
              style={{ animation: 'geminiRotate 3s linear infinite' }}
            />
            <circle cx="14" cy="14" r="3" fill="#FF6B00" style={{ opacity: 0.9 }} />
          </svg>
        </div>
        <div>
          <p style={{
            fontFamily: 'monospace', fontWeight: 700, fontSize: 11,
            letterSpacing: '0.22em', color: '#FF6B00', textTransform: 'uppercase',
          }}>
            Gemini Vision
          </p>
          <p style={{
            fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.14em',
            color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 2,
          }}>
            Gemini 1.5 Flash
          </p>
        </div>
      </div>

      {/* Stages */}
      <div className="w-full flex flex-col gap-3">
        {stages.map((s, i) => {
          const isDone    = i < stage
          const isActive  = i === stage
          const isPending = i > stage
          return (
            <div key={i} className="flex items-center gap-3"
              style={{ opacity: isPending ? 0.28 : 1, transition: 'opacity 0.5s' }}>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: isDone ? 'rgba(0,230,118,0.15)' : isActive ? 'rgba(255,107,0,0.15)' : 'transparent',
                  border: `1.5px solid ${isDone ? '#00E676' : isActive ? '#FF6B00' : 'rgba(255,255,255,0.15)'}`,
                  transition: 'all 0.4s',
                }}
              >
                <span style={{
                  fontSize: isDone ? 9 : 11, color: isDone ? '#00E676' : isActive ? '#FF6B00' : 'rgba(255,255,255,0.3)',
                  fontFamily: 'monospace',
                }}>
                  {isDone ? '✓' : s.icon}
                </span>
              </div>
              <span style={{
                fontFamily: 'monospace', fontSize: 10,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: isActive ? 'white' : isDone ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
                transition: 'color 0.4s',
              }}>
                {s.label}
                {isActive && (
                  <span style={{ color: '#FF6B00', animation: 'dotBlink 1.2s ease-in-out infinite', marginLeft: 4 }}>
                    ···
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {/* Barre de progression */}
      <div className="w-full">
        <div style={{ height: 2, background: 'rgba(255,255,255,0.07)', borderRadius: 1 }}>
          <div style={{
            height: '100%', borderRadius: 1,
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #FF3200, #FF8800)',
            boxShadow: '0 0 8px rgba(255,85,0,0.5)',
            transition: 'width 0.4s ease',
          }} />
        </div>
        <p style={{
          fontFamily: 'monospace', fontSize: 9,
          letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)',
          textAlign: 'right', marginTop: 6,
        }}>
          {progress}%
        </p>
      </div>
    </div>
  )
}

// ── Bannière hors-ligne (vraie coupure réseau) ────────────────────────────────

function OfflineBanner() {
  return (
    <div
      className="mx-5 mt-4 mb-0 flex items-start gap-3 rounded-2xl px-4 py-3.5"
      style={{
        backgroundColor: 'rgba(255,140,0,0.09)',
        border: '1px solid rgba(255,140,0,0.28)',
      }}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'rgba(255,140,0,0.15)', border: '1px solid rgba(255,140,0,0.35)' }}
      >
        <WifiOff size={13} style={{ color: '#FF8C00' }} />
      </div>
      <div>
        <p style={{
          fontFamily: 'monospace', fontWeight: 700, fontSize: 9,
          letterSpacing: '0.16em', textTransform: 'uppercase', color: '#FF8C00', marginBottom: 4,
        }}>
          Analyse différée
        </p>
        <p style={{ fontSize: 11, color: 'rgba(255,180,80,0.8)', lineHeight: 1.6 }}>
          Photo sauvegardée localement. L&apos;analyse Gemini sera lancée dès
          le retour de la connexion. Vous pouvez aussi saisir les valeurs manuellement.
        </p>
      </div>
    </div>
  )
}

// ── Bannière quota Gemini dépassé ────────────────────────────────────────────

function QuotaBanner({ retryAfter }: { retryAfter?: number }) {
  return (
    <div
      className="mx-5 mt-4 mb-0 flex items-start gap-3 rounded-2xl px-4 py-3.5"
      style={{
        backgroundColor: 'rgba(255,80,0,0.07)',
        border: '1px solid rgba(255,100,0,0.28)',
      }}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'rgba(255,80,0,0.15)', border: '1px solid rgba(255,100,0,0.35)' }}
      >
        <Gauge size={13} style={{ color: '#FF6400' }} />
      </div>
      <div>
        <p style={{
          fontFamily: 'monospace', fontWeight: 700, fontSize: 9,
          letterSpacing: '0.16em', textTransform: 'uppercase', color: '#FF6400', marginBottom: 4,
        }}>
          Quota Gemini dépassé
        </p>
        <p style={{ fontSize: 11, color: 'rgba(255,160,80,0.85)', lineHeight: 1.6 }}>
          {retryAfter
            ? `Limite atteinte — réessaie dans ~${retryAfter}s.`
            : 'Limite de requêtes atteinte sur ce compte Google AI Studio.'}
          {' '}Photo sauvegardée, saisie manuelle possible.
        </p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
          → aistudio.google.com/app/apikey — vérifier le plan et le quota
        </p>
      </div>
    </div>
  )
}

// ── Bannière erreur API Gemini (réseau OK, Gemini KO) ────────────────────────

function ApiErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="mx-5 mt-4 mb-0 flex items-start gap-3 rounded-2xl px-4 py-3.5"
      style={{
        backgroundColor: 'rgba(255,50,50,0.07)',
        border: '1px solid rgba(255,80,80,0.28)',
      }}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 flex-shrink-0"
        style={{ backgroundColor: 'rgba(255,60,60,0.15)', border: '1px solid rgba(255,80,80,0.35)' }}
      >
        <AlertTriangle size={13} style={{ color: '#FF5555' }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{
          fontFamily: 'monospace', fontWeight: 700, fontSize: 9,
          letterSpacing: '0.16em', textTransform: 'uppercase', color: '#FF5555', marginBottom: 4,
        }}>
          Erreur Gemini
        </p>
        <p style={{ fontSize: 11, color: 'rgba(255,120,120,0.85)', lineHeight: 1.6, wordBreak: 'break-word' }}>
          {message}
        </p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
          Vérifiez les logs Vercel ou DevTools → Console pour le détail complet.
        </p>
      </div>
    </div>
  )
}

// ── Badge vérification mathématique ──────────────────────────────────────────

function MathVerificationBadge({ liters, pricePerLiter, totalCost }: {
  liters: string; pricePerLiter: string; totalCost: string
}) {
  const l = parseFloat(liters)
  const t = parseFloat(totalCost)
  const p = parseFloat(pricePerLiter)
  const hasL = !isNaN(l) && l > 0
  const hasT = !isNaN(t) && t > 0
  const hasP = !isNaN(p) && p > 0
  if (!hasL || !hasT) return null

  const verdict = mathCheck(l, t, hasP ? p : undefined)

  if (verdict.consistent) {
    return (
      <div className="mx-5 mt-3 mb-1 flex items-center gap-2.5 rounded-xl px-4 py-2.5"
        style={{ backgroundColor: 'rgba(0,230,118,0.07)', border: '1px solid rgba(0,230,118,0.22)' }}>
        <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'rgba(0,230,118,0.2)', border: '1px solid rgba(0,230,118,0.5)' }}>
          <span style={{ fontSize: '8px', color: '#00E676' }}>✓</span>
        </div>
        <div>
          <p style={{ fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
            letterSpacing: '0.12em', textTransform: 'uppercase', color: '#00E676' }}>
            Vérifié mathématiquement
          </p>
          <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(0,230,118,0.6)', marginTop: 1 }}>
            {l.toFixed(2)} L × {verdict.derivedPpl} €/L = {t.toFixed(2)} €
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-5 mt-3 mb-1 flex items-start gap-2.5 rounded-xl px-4 py-2.5"
      style={{ backgroundColor: 'rgba(255,140,0,0.07)', border: '1px solid rgba(255,140,0,0.22)' }}>
      <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: 'rgba(255,140,0,0.15)', border: '1px solid rgba(255,140,0,0.4)' }}>
        <span style={{ fontSize: '8px', color: '#FF8C00' }}>!</span>
      </div>
      <div>
        <p style={{ fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase', color: '#FF8C00' }}>
          Lecture incertaine — vérifiez les virgules
        </p>
        {verdict.hint && (
          <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,140,0,0.65)',
            marginTop: 2, lineHeight: 1.5 }}>
            {verdict.hint}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Overlay principal ─────────────────────────────────────────────────────────

export function OcrReviewOverlay({
  imageUrl, phase, extracted, progress, defaultFuelType, onConfirm, onRetry, onClose,
}: OcrReviewOverlayProps) {
  const [localExtracted, setLocalExtracted] = useState<OcrExtracted>(extracted)

  useEffect(() => { setLocalExtracted(extracted) }, [extracted])

  const [values, setValues] = useState<OcrReviewValues>({
    liters:        extracted.liters?.toString()         ?? '',
    pricePerLiter: extracted.pricePerLiter?.toFixed(3)  ?? '',
    totalCost:     extracted.totalCost?.toFixed(2)      ?? '',
    fuelType:      defaultFuelType,
  })

  useEffect(() => {
    setValues({
      liters:        extracted.liters?.toString()         ?? '',
      pricePerLiter: extracted.pricePerLiter?.toFixed(3)  ?? '',
      totalCost:     extracted.totalCost?.toFixed(2)      ?? '',
      fuelType:      defaultFuelType,
    })
  }, [extracted, defaultFuelType])

  const set = (field: keyof OcrReviewValues) => (v: string) =>
    setValues((prev) => ({ ...prev, [field]: v }))

  const canConfirm    = values.liters && values.totalCost
  const isQuotaError  = localExtracted.pendingOffline === true && localExtracted.quotaError === true
  const isOffline     = localExtracted.pendingOffline === true && !isQuotaError
  const isApiError    = !isOffline && !isQuotaError && !!localExtracted.errorMessage
  const isFromGemini  = localExtracted.fromGemini === true
  const allFound      = localExtracted.liters && localExtracted.pricePerLiter && localExtracted.totalCost

  const [dots, setDots] = useState('.')
  useEffect(() => {
    if (phase !== 'processing') return
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? '.' : d + '.')), 400)
    return () => clearInterval(id)
  }, [phase])

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ backgroundColor: '#05050A' }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-5 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-2.5">
          {phase === 'processing' ? (
            <>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#FF8833' }} />
              <span className="text-sm font-bold uppercase tracking-[0.18em]"
                style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-condensed)' }}>
                Analyse{dots}
              </span>
            </>
          ) : isQuotaError ? (
            <>
              <Gauge size={13} style={{ color: '#FF6400' }} />
              <span className="text-sm font-bold uppercase tracking-[0.18em]"
                style={{ color: '#FF6400', fontFamily: 'var(--font-condensed)' }}>
                Quota dépassé
              </span>
            </>
          ) : isOffline ? (
            <>
              <WifiOff size={13} style={{ color: '#FF8C00' }} />
              <span className="text-sm font-bold uppercase tracking-[0.18em]"
                style={{ color: '#FF8C00', fontFamily: 'var(--font-condensed)' }}>
                Hors-ligne
              </span>
            </>
          ) : isApiError ? (
            <>
              <AlertTriangle size={13} style={{ color: '#FF5555' }} />
              <span className="text-sm font-bold uppercase tracking-[0.18em]"
                style={{ color: '#FF5555', fontFamily: 'var(--font-condensed)' }}>
                Erreur Gemini
              </span>
            </>
          ) : allFound ? (
            <>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#00E676' }} />
              <span className="text-sm font-bold uppercase tracking-[0.18em]"
                style={{ color: '#00E676', fontFamily: 'var(--font-condensed)' }}>
                Valeurs détectées
              </span>
            </>
          ) : (
            <>
              <AlertTriangle size={14} style={{ color: '#FF8833' }} />
              <span className="text-sm font-bold uppercase tracking-[0.18em]"
                style={{ color: '#FF8833', fontFamily: 'var(--font-condensed)' }}>
                Revue requise
              </span>
            </>
          )}
        </div>

        {/* Badge Gemini */}
        {phase === 'review' && isFromGemini && !isOffline && (
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
            style={{
              backgroundColor: 'rgba(255,107,0,0.1)',
              border: '1px solid rgba(255,107,0,0.25)',
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#FF6B00' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 8, fontWeight: 700,
              letterSpacing: '0.14em', color: '#FF9944', textTransform: 'uppercase' }}>
              Gemini Vision
            </span>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <X size={14} style={{ color: 'rgba(255,255,255,0.6)' }} />
        </button>
      </div>

      {/* ── Photo ── */}
      <div
        className="relative flex-shrink-0 overflow-hidden"
        style={{ height: phase === 'review' ? '30vh' : '38vh', maxHeight: '300px' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Photo pompe"
          className="w-full h-full"
          style={{ objectFit: 'cover', objectPosition: 'center' }}
        />

        {/* Vignette bas */}
        <div className="absolute inset-x-0 bottom-0 h-20 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, #05050A)' }} />

        {/* Scan beam pendant le processing */}
        {phase === 'processing' && (
          <div
            className="absolute inset-x-0 h-px pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, #FF6B00, #FF6B00, transparent)',
              boxShadow: '0 0 12px 3px rgba(255,107,0,0.5)',
              animation: 'scanBeam 1.8s ease-in-out infinite',
            }}
          />
        )}

        {/* Coin brackets */}
        {['tl','tr','bl','br'].map((c) => (
          <div key={c} className="absolute w-5 h-5" style={{
            top: c.startsWith('t') ? '12px' : undefined,
            bottom: c.startsWith('b') ? '12px' : undefined,
            left: c.endsWith('l') ? '12px' : undefined,
            right: c.endsWith('r') ? '12px' : undefined,
            borderTopWidth:    c.startsWith('t') ? '2px' : '0',
            borderBottomWidth: c.startsWith('b') ? '2px' : '0',
            borderLeftWidth:   c.endsWith('l')   ? '2px' : '0',
            borderRightWidth:  c.endsWith('r')   ? '2px' : '0',
            borderStyle: 'solid',
            borderColor: isOffline ? '#FF8C00' : phase === 'review' && allFound ? '#00E676' : '#FF6B00',
            opacity: 0.8,
          }} />
        ))}

        {/* Barre de progression */}
        {phase === 'processing' && (
          <div className="absolute bottom-0 inset-x-0 h-0.5" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full transition-all duration-300"
              style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #FF3200, #FF8800)' }} />
          </div>
        )}
      </div>

      {/* ── Corps ── */}
      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
        {phase === 'processing' ? (
          <GeminiLoader progress={progress} />
        ) : (
          <div>
            {/* Bannière quota Gemini */}
            {isQuotaError && <QuotaBanner retryAfter={localExtracted.retryAfter} />}

            {/* Bannière hors-ligne (réseau coupé) */}
            {isOffline && <OfflineBanner />}

            {/* Bannière erreur API Gemini (réseau OK mais Gemini a rejeté) */}
            {isApiError && <ApiErrorBanner message={localExtracted.errorMessage!} />}

            {/* Champs */}
            <div className="mt-2">
              <ReviewField label="Litres"      unit="L"   value={values.liters}        conf={localExtracted.litersConf}        onChange={set('liters')} />
              <ReviewField label="Prix / Litre" unit="€/L" value={values.pricePerLiter} conf={localExtracted.pricePerLiterConf} onChange={set('pricePerLiter')} />
              <ReviewField label="Total"        unit="€"   value={values.totalCost}     conf={localExtracted.totalCostConf}     onChange={set('totalCost')} />
            </div>

            {/* Badge math */}
            {!isOffline && (
              <MathVerificationBadge
                liters={values.liters}
                pricePerLiter={values.pricePerLiter}
                totalCost={values.totalCost}
              />
            )}

            <p className="text-center text-[10px] mt-2"
              style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-sans)' }}>
              Tapez une valeur pour la corriger
            </p>
          </div>
        )}
      </div>

      {/* ── Footer CTA ── */}
      {phase === 'review' && (
        <div
          className="flex-shrink-0 px-5 pt-3 pb-6 flex flex-col gap-3"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 12px)',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            backgroundColor: '#05050A',
          }}
        >
          <button
            onClick={() => canConfirm && onConfirm(values)}
            disabled={!canConfirm}
            className="w-full rounded-2xl py-4 flex items-center justify-center gap-2.5 font-black uppercase tracking-[0.12em] transition-all active:scale-[0.98]"
            style={{
              fontFamily: 'var(--font-condensed)', fontSize: '15px',
              background: canConfirm
                ? 'linear-gradient(135deg, #FF4400 0%, #FF8800 100%)'
                : 'rgba(255,255,255,0.06)',
              color: canConfirm ? 'white' : 'rgba(255,255,255,0.25)',
              boxShadow: canConfirm ? '0 6px 28px rgba(255,68,0,0.4)' : 'none',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
          >
            <Check size={16} strokeWidth={2.5} />
            {isOffline || isQuotaError || isApiError ? 'Saisir manuellement' : 'Confirmer ce plein'}
          </button>

          <button
            onClick={onRetry}
            className="w-full rounded-2xl py-3 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest transition-all active:opacity-60"
            style={{
              fontFamily: 'var(--font-condensed)',
              color: 'rgba(255,255,255,0.4)',
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <RotateCcw size={13} />
            Rescanner
          </button>
        </div>
      )}

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes scanBeam {
          0%   { top: 0%;   opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes geminiPulse {
          0%, 100% { box-shadow: 0 0 32px rgba(255,85,0,0.15); }
          50%       { box-shadow: 0 0 48px rgba(255,85,0,0.35); }
        }
        @keyframes geminiRotate {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: 100; }
        }
        @keyframes dotBlink {
          0%, 100% { opacity: 0.2; }
          50%       { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── Hook OcrState (rétro-compat) ──────────────────────────────────────────────

export type OcrState =
  | { phase: 'idle' }
  | { phase: 'processing'; imageUrl: string; progress: number }
  | { phase: 'review'; imageUrl: string; extracted: OcrExtracted }

// ── Re-export runOcr depuis lib/geminiOcr pour rétro-compatibilité ────────────
export { runOcr } from '@/lib/geminiOcr'
