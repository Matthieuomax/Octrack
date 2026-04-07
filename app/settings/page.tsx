'use client'

import { useState } from 'react'
import { ArrowLeft, Sun, Moon, Monitor, Trash2, Check, AlertCircle, User, LogOut, RefreshCw, LogIn, CloudOff, Cloud } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useApp } from '@/components/AppContext'
import { FuelType, FUEL_TYPE_LABELS } from '@/lib/types'
import { fromEmail } from '@/lib/supabase'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs font-bold uppercase tracking-widest px-1 mb-2 mt-5"
      style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-accent)' }}
    >
      {children}
    </p>
  )
}

function SettingRow({
  label,
  children,
  description,
}: {
  label: string
  children: React.ReactNode
  description?: string
}) {
  return (
    <div
      className="px-4 py-3 flex items-center justify-between gap-3"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--color-content)' }}>
          {label}
        </p>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
            {description}
          </p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

type ThemeOption = 'dark' | 'light' | 'system'

const THEME_OPTIONS: { key: ThemeOption; icon: React.ElementType; label: string }[] = [
  { key: 'light',  icon: Sun,     label: 'Clair'    },
  { key: 'system', icon: Monitor, label: 'Système'  },
  { key: 'dark',   icon: Moon,    label: 'Sombre'   },
]

function ThemeToggle({
  value,
  onChange,
}: {
  value: ThemeOption
  onChange: (v: ThemeOption) => void
}) {
  return (
    <div
      className="flex rounded-2xl p-1 gap-1 w-full"
      style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
    >
      {THEME_OPTIONS.map(({ key, icon: Icon, label }) => {
        const active = value === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all active:scale-95"
            style={{
              backgroundColor: active ? 'var(--color-accent)' : 'transparent',
              color: active ? 'white' : 'var(--color-muted)',
              boxShadow: active ? '0 2px 12px rgba(255,85,0,0.35)' : 'none',
              fontFamily: 'var(--font-condensed)',
              fontSize: '11px',
              letterSpacing: '0.07em',
            }}
          >
            <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

function InlineInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      inputMode={type === 'number' ? 'decimal' : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="text-sm text-right bg-transparent outline-none border-b"
      style={{
        color: 'var(--color-content)',
        borderColor: 'var(--color-border)',
        width: '120px',
        paddingBottom: '2px',
      }}
    />
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { settings, updateSettings, fillUps, user, signOut, syncStatus, pendingCount, triggerSync } = useApp()

  const [carBrand, setCarBrand] = useState(settings.carBrand)
  const [carModel, setCarModel] = useState(settings.carModel)
  const [carYear, setCarYear] = useState(settings.carYear)
  const [tankCapacity, setTankCapacity] = useState(settings.tankCapacity.toString())
  const [fuelType, setFuelType] = useState<FuelType>(settings.fuelType)
  const [theme, setTheme] = useState<ThemeOption>(settings.theme)
  const [saved, setSaved] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const handleSave = () => {
    updateSettings({
      carBrand,
      carModel,
      carYear,
      tankCapacity: parseFloat(tankCapacity) || 50,
      fuelType,
      theme,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleThemeChange = (v: ThemeOption) => {
    setTheme(v)
    updateSettings({ theme: v })
  }

  const handleReset = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('octrack_fillups')
      localStorage.removeItem('octrack_settings')
      window.location.href = '/'
    }
  }

  const tankVal = parseFloat(tankCapacity) || 50
  const sliderPct = Math.min(Math.max((tankVal - 20) / (120 - 20), 0), 1)

  return (
    <div className="px-4 pt-12 pb-8 page-enter">
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
            Réglages
          </h1>
        </div>
      </div>

      {/* Section Véhicule */}
      <SectionTitle>Véhicule</SectionTitle>
      <div className="card overflow-hidden">
        <SettingRow label="Marque" description="Ex: Peugeot, Renault, VW">
          <InlineInput value={carBrand} onChange={setCarBrand} placeholder="Peugeot" />
        </SettingRow>
        <SettingRow label="Modèle" description="Ex: 308, Clio, Golf">
          <InlineInput value={carModel} onChange={setCarModel} placeholder="308" />
        </SettingRow>
        <SettingRow label="Année">
          <InlineInput value={carYear} onChange={setCarYear} placeholder="2022" type="number" />
        </SettingRow>
      </div>

      {/* Section Carburant */}
      <SectionTitle>Carburant & Réservoir</SectionTitle>
      <div className="card overflow-hidden">
        <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--color-content)' }}>
            Type de carburant
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(FUEL_TYPE_LABELS) as [FuelType, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFuelType(key)}
                className="px-3 py-2 rounded-xl text-xs font-bold transition-all"
                style={{
                  backgroundColor: fuelType === key ? 'var(--color-accent)' : 'var(--color-surface-2)',
                  color: fuelType === key ? 'white' : 'var(--color-muted)',
                  border: fuelType === key ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium" style={{ color: 'var(--color-content)' }}>
              Capacité réservoir
            </p>
            <div className="flex items-center gap-1">
              <input
                type="number"
                inputMode="decimal"
                value={tankCapacity}
                onChange={(e) => setTankCapacity(e.target.value)}
                className="text-right text-base font-bold bg-transparent outline-none w-12"
                style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-condensed)' }}
              />
              <span className="text-sm" style={{ color: 'var(--color-muted)' }}>L</span>
            </div>
          </div>

          {/* Slider visuel */}
          <div className="relative h-6 flex items-center">
            <div
              className="absolute inset-y-0 left-0 right-0 flex items-center"
            >
              <div
                className="w-full h-2 rounded-full relative"
                style={{ backgroundColor: 'var(--color-surface-2)' }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${sliderPct * 100}%`,
                    backgroundColor: 'var(--color-accent)',
                  }}
                />
                <input
                  type="range"
                  min="20"
                  max="120"
                  step="5"
                  value={tankVal}
                  onChange={(e) => setTankCapacity(e.target.value)}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                  style={{ zIndex: 1 }}
                />
                <div
                  className="absolute w-5 h-5 rounded-full -top-1.5 -translate-x-1/2 border-2"
                  style={{
                    left: `${sliderPct * 100}%`,
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-accent)',
                    boxShadow: '0 0 8px rgba(255,85,0,0.3)',
                  }}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--color-muted)' }}>
            <span>20 L</span>
            <span>120 L</span>
          </div>
        </div>
      </div>

      {/* Section Apparence */}
      <SectionTitle>Apparence</SectionTitle>
      <div className="card p-4">
        <div className="mb-3">
          <p className="text-sm font-medium" style={{ color: 'var(--color-content)' }}>
            Thème
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
            Bitume (sombre) · Asphalte (clair) · Suit l&apos;OS
          </p>
        </div>
        <ThemeToggle value={theme} onChange={handleThemeChange} />
      </div>

      {/* Section Données */}
      <SectionTitle>Données</SectionTitle>
      <div className="card overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--color-content)' }}>
              Pleins enregistrés
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              Stockés sur cet appareil
            </p>
          </div>
          <span
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-accent)' }}
          >
            {fillUps.length}
          </span>
        </div>

        <div
          className="px-4 py-3"
          style={{ borderTop: '1px solid var(--color-border)' }}
        >
          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 text-sm"
              style={{ color: 'var(--color-alert)' }}
            >
              <Trash2 size={14} />
              Réinitialiser toutes les données
            </button>
          ) : (
            <div>
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle size={14} style={{ color: 'var(--color-alert)', flexShrink: 0, marginTop: 2 }} />
                <p className="text-xs" style={{ color: 'var(--color-alert)' }}>
                  Toutes les données seront supprimées définitivement. Cette action est irréversible.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                  style={{ backgroundColor: 'var(--color-alert)', color: 'white' }}
                >
                  Confirmer
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm btn-ghost"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section Compte */}
      <SectionTitle>Compte & Synchronisation</SectionTitle>
      <div className="card overflow-hidden">
        {user ? (
          <>
            {/* Utilisateur connecté */}
            <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(255,107,0,0.15)' }}
              >
                <User size={16} style={{ color: 'var(--color-accent)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: 'var(--color-content)' }}>
                  {fromEmail(user.email ?? '')}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  {pendingCount > 0
                    ? `${pendingCount} plein${pendingCount > 1 ? 's' : ''} à synchroniser`
                    : 'Tout est synchronisé'}
                </p>
              </div>
              {syncStatus === 'syncing' ? (
                <Cloud size={16} style={{ color: '#FF8833' }} className="animate-pulse" />
              ) : syncStatus === 'error' ? (
                <CloudOff size={16} style={{ color: '#FF5533' }} />
              ) : (
                <Cloud size={16} style={{ color: pendingCount > 0 ? '#FF8833' : '#00C47A' }} />
              )}
            </div>

            {/* Sync now */}
            <button
              onClick={triggerSync}
              disabled={syncStatus === 'syncing'}
              className="w-full px-4 py-3 flex items-center gap-3 transition-opacity active:opacity-50"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <RefreshCw
                size={16}
                style={{ color: 'var(--color-accent)' }}
                className={syncStatus === 'syncing' ? 'animate-spin' : ''}
              />
              <span className="text-sm" style={{ color: 'var(--color-content)' }}>
                {syncStatus === 'syncing' ? 'Synchronisation…' : 'Synchroniser maintenant'}
              </span>
            </button>

            {/* Déconnexion */}
            <button
              onClick={signOut}
              className="w-full px-4 py-3 flex items-center gap-3 transition-opacity active:opacity-50"
            >
              <LogOut size={16} style={{ color: 'var(--color-alert)' }} />
              <span className="text-sm" style={{ color: 'var(--color-alert)' }}>
                Se déconnecter
              </span>
            </button>
          </>
        ) : (
          /* Pas connecté */
          <div className="px-4 py-4">
            <p className="text-sm mb-1" style={{ color: 'var(--color-content)' }}>
              Pas de compte
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--color-muted)' }}>
              Créez un compte pour sauvegarder vos données dans le cloud et les retrouver sur n&apos;importe quel appareil.
            </p>
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold transition-all active:opacity-80"
              style={{
                background: 'linear-gradient(135deg, #FF5500 0%, #FF8800 100%)',
                color: 'white',
                boxShadow: '0 4px 16px rgba(255,85,0,0.3)',
                fontFamily: 'var(--font-condensed)',
                letterSpacing: '0.06em',
              }}
            >
              <LogIn size={15} />
              Connecter un compte
            </Link>
          </div>
        )}
      </div>

      {/* Section À propos */}
      <SectionTitle>À propos</SectionTitle>
      <div className="card overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <p className="text-sm" style={{ color: 'var(--color-content)' }}>Version</p>
          <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-muted)' }}>
            0.1.0
          </span>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Octrack — Suivi carburant personnel. Données stockées localement sur votre appareil.
          </p>
        </div>
      </div>

      {/* Save button */}
      <div className="mt-6">
        <button
          onClick={handleSave}
          className="btn-primary flex items-center justify-center gap-2"
        >
          {saved ? (
            <>
              <Check size={16} />
              Réglages sauvegardés
            </>
          ) : (
            'Sauvegarder'
          )}
        </button>
      </div>
    </div>
  )
}
