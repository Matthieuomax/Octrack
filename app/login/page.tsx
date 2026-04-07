'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/AppContext'

type Mode = 'signin' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const { user, authLoading, signIn, signUp } = useApp()

  const [mode, setMode]         = useState<Mode>('signin')
  const [pseudo, setPseudo]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  // Redirige si déjà connecté
  useEffect(() => {
    if (!authLoading && user) router.replace('/')
  }, [user, authLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pseudo.trim() || !password) return
    setError(null)
    setLoading(true)

    const err = mode === 'signin'
      ? await signIn(pseudo.trim(), password)
      : await signUp(pseudo.trim(), password)

    if (err) {
      // Traduction des erreurs Supabase en français
      if (err.includes('Invalid login credentials'))
        setError('Pseudo ou mot de passe incorrect.')
      else if (err.includes('User already registered'))
        setError('Ce pseudo est déjà utilisé.')
      else if (err.includes('Password should be'))
        setError('Mot de passe trop court (6 caractères min).')
      else
        setError(err)
      setLoading(false)
    } else {
      router.replace('/')
    }
  }

  if (authLoading) return null

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden"
      style={{ backgroundColor: '#080810' }}
    >
      {/* ── Fond texturé asphalte ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 60% at 50% -10%, rgba(255,107,0,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 40% 30% at 80% 90%, rgba(255,50,0,0.06) 0%, transparent 50%)
          `,
        }}
      />
      {/* Grain */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }}
      />

      {/* ── Logo / titre ── */}
      <div className="relative z-10 flex flex-col items-center mb-10">
        {/* Icône tachymètre minimaliste */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 relative"
          style={{
            background: 'linear-gradient(135deg, #1C1C28 0%, #0C0C14 100%)',
            border: '1px solid rgba(255,107,0,0.25)',
            boxShadow: '0 0 40px rgba(255,107,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="13" stroke="#2A2A38" strokeWidth="2.5"/>
            <path
              d="M8.5 24 A11 11 0 1 1 27.5 24"
              stroke="#1E1E2E"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M8.5 24 A11 11 0 0 1 24.5 10.5"
              stroke="url(#g1)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            <line x1="18" y1="18" x2="25" y2="11.5" stroke="url(#g2)" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="18" cy="18" r="2.2" fill="#1A1A2A" stroke="#3A3A4E" strokeWidth="1"/>
            <defs>
              <linearGradient id="g1" x1="8.5" y1="24" x2="24.5" y2="10.5" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FF3200"/>
                <stop offset="1" stopColor="#FFD700"/>
              </linearGradient>
              <linearGradient id="g2" x1="18" y1="18" x2="25" y2="11.5" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FF6B00"/>
                <stop offset="1" stopColor="#FFE000"/>
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h1
          className="text-4xl font-black uppercase tracking-[0.12em]"
          style={{
            fontFamily: 'var(--font-condensed)',
            background: 'linear-gradient(135deg, #FFFFFF 30%, #888 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Octrack
        </h1>
        <p
          className="text-xs mt-1 uppercase tracking-[0.2em]"
          style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-condensed)' }}
        >
          Maîtrisez votre carburant
        </p>
      </div>

      {/* ── Card formulaire ── */}
      <div
        className="relative z-10 w-full max-w-sm rounded-3xl p-6"
        style={{
          background: 'linear-gradient(160deg, #141420 0%, #0E0E18 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,107,0,0.05)',
        }}
      >
        {/* ── Onglets mode ── */}
        <div
          className="flex rounded-xl p-1 mb-6"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {(['signin', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null) }}
              className="flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all duration-200"
              style={{
                fontFamily: 'var(--font-condensed)',
                backgroundColor: mode === m ? 'var(--color-accent, #FF5500)' : 'transparent',
                color: mode === m ? 'white' : 'rgba(255,255,255,0.35)',
                boxShadow: mode === m ? '0 2px 12px rgba(255,85,0,0.35)' : 'none',
              }}
            >
              {m === 'signin' ? 'Se connecter' : 'Créer un compte'}
            </button>
          ))}
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Pseudo */}
          <div className="flex flex-col gap-1.5">
            <label
              className="text-[11px] uppercase tracking-widest font-bold"
              style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-condensed)' }}
            >
              Pseudo
            </label>
            <div className="relative">
              <input
                type="text"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                placeholder="tonpseudo"
                autoComplete="username"
                autoCapitalize="none"
                required
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white',
                  fontFamily: 'var(--font-sans)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(255,107,0,0.5)'
                  e.target.style.backgroundColor = 'rgba(255,107,0,0.05)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.1)'
                  e.target.style.backgroundColor = 'rgba(255,255,255,0.05)'
                }}
              />
            </div>
          </div>

          {/* Mot de passe */}
          <div className="flex flex-col gap-1.5">
            <label
              className="text-[11px] uppercase tracking-widest font-bold"
              style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-condensed)' }}
            >
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'white',
                fontFamily: 'var(--font-sans)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(255,107,0,0.5)'
                e.target.style.backgroundColor = 'rgba(255,107,0,0.05)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255,255,255,0.1)'
                e.target.style.backgroundColor = 'rgba(255,255,255,0.05)'
              }}
            />
          </div>

          {/* Erreur */}
          {error && (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs"
              style={{
                backgroundColor: 'rgba(255,60,0,0.1)',
                border: '1px solid rgba(255,60,0,0.2)',
                color: '#FF8866',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
                <line x1="7" y1="4" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="7" cy="9.5" r="0.8" fill="currentColor"/>
              </svg>
              {error}
            </div>
          )}

          {/* CTA */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl py-3.5 text-sm font-black uppercase tracking-widest transition-all duration-200 active:scale-[0.98] mt-1"
            style={{
              fontFamily: 'var(--font-condensed)',
              background: loading
                ? 'rgba(255,107,0,0.4)'
                : 'linear-gradient(135deg, #FF5500 0%, #FF8800 100%)',
              color: 'white',
              boxShadow: loading ? 'none' : '0 4px 24px rgba(255,85,0,0.4)',
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.12em',
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14">
                  <circle cx="7" cy="7" r="5.5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none"/>
                  <path d="M7 1.5 A5.5 5.5 0 0 1 12.5 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                </svg>
                Chargement…
              </span>
            ) : mode === 'signin' ? 'Se connecter' : 'Créer le compte'}
          </button>
        </form>

        {/* ── Mention usage local ── */}
        <p
          className="text-center text-[10px] mt-5 leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.18)', fontFamily: 'var(--font-sans)' }}
        >
          L&apos;app fonctionne aussi sans compte.{'\n'}
          Vos données sont sauvegardées localement.
        </p>
      </div>

      {/* ── Lien skip ── */}
      <button
        onClick={() => router.replace('/')}
        className="relative z-10 mt-6 text-xs uppercase tracking-widest transition-all active:opacity-50"
        style={{
          color: 'rgba(255,255,255,0.25)',
          fontFamily: 'var(--font-condensed)',
          letterSpacing: '0.15em',
        }}
      >
        Continuer sans compte →
      </button>
    </div>
  )
}
