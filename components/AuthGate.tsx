'use client'

/**
 * AuthGate — Protège les routes nécessitant une connexion.
 * Pour Octrack, l'app est utilisable sans compte (offline-first).
 * Ce composant expose juste un badge de sync dans la nav.
 */

import { useApp } from '@/components/AppContext'

/** Hook utilitaire pour accéder à l'état auth/sync */
export function useAuth() {
  const { user, authLoading, signIn, signUp, signOut, syncStatus, pendingCount } = useApp()
  return { user, authLoading, signIn, signUp, signOut, syncStatus, pendingCount }
}

/** Composant de badge de statut sync (utilisé dans BottomNav / Header) */
export function SyncBadge() {
  const { syncStatus, pendingCount, user } = useAuth()

  if (!user) return null

  if (syncStatus === 'syncing') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full"
        style={{
          backgroundColor: 'rgba(255,107,0,0.15)',
          color: '#FF8833',
          fontFamily: 'var(--font-condensed)',
        }}
      >
        <svg className="animate-spin" width="8" height="8" viewBox="0 0 8 8">
          <circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeDasharray="12 4"/>
        </svg>
        Sync
      </span>
    )
  }

  if (syncStatus === 'error') {
    return (
      <span
        className="inline-flex items-center text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full"
        style={{
          backgroundColor: 'rgba(255,60,0,0.15)',
          color: '#FF5533',
          fontFamily: 'var(--font-condensed)',
        }}
      >
        ✕
      </span>
    )
  }

  if (pendingCount > 0) {
    return (
      <span
        className="inline-flex items-center justify-center text-[9px] font-bold w-4 h-4 rounded-full"
        style={{
          backgroundColor: 'rgba(255,107,0,0.8)',
          color: 'white',
          fontFamily: 'var(--font-condensed)',
        }}
      >
        {pendingCount > 9 ? '9+' : pendingCount}
      </span>
    )
  }

  return null
}
