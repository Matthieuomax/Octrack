'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { FillUp, Settings } from '@/lib/types'
import { DEFAULT_SETTINGS } from '@/lib/sampleData'
import { supabase, toEmail, fromEmail } from '@/lib/supabase'
import {
  localGetFillUps,
  localSetFillUps,
  localGetSettings,
  localSetSettings,
  fullSync,
  pushPending,
  purgeUserData,
  ensureProfile,
} from '@/lib/syncManager'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

interface AppContextType {
  // Data
  fillUps: FillUp[]
  settings: Settings
  // CRUD
  addFillUp: (fillUp: Omit<FillUp, 'id'>) => void
  updateFillUp: (id: string, fillUp: Omit<FillUp, 'id'>) => void
  deleteFillUp: (id: string) => void
  updateSettings: (partial: Partial<Settings>) => void
  // Auth
  user: User | null
  authLoading: boolean
  signIn: (pseudo: string, password: string) => Promise<string | null>
  signUp: (pseudo: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  // Sync
  syncStatus: SyncStatus
  pendingCount: number
  triggerSync: () => Promise<void>
  // Reset
  resetAllData: () => Promise<void>
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [fillUps, setFillUps]       = useState<FillUp[]>([])
  const [settings, setSettings]     = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded]         = useState(false)
  const [user, setUser]             = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const syncLock = useRef(false)

  // ── Pending count ──────────────────────────────────────────
  const pendingCount = fillUps.filter((f) => !f._synced).length

  // ── Persist locally ───────────────────────────────────────
  const applyFillUps = useCallback((updated: FillUp[]) => {
    setFillUps(updated)
    localSetFillUps(updated)
  }, [])

  const applySettings = useCallback((updated: Settings) => {
    setSettings(updated)
    localSetSettings(updated)
  }, [])

  // ── Load from localStorage on mount ───────────────────────
  useEffect(() => {
    const saved = localGetFillUps()
    // Filtre les IDs d'exemple (commençant par 's') hérités d'anciennes versions.
    // En mode Full Cloud, le serveur est la source de vérité → on ne charge jamais
    // de données fictives, même si le localStorage est vide.
    const real = saved.filter((f) => !f.id.startsWith('s'))
    if (real.length !== saved.length) {
      // Nettoie le localStorage si des exemples traînaient
      localSetFillUps(real)
    }
    setFillUps(real)

    const savedSettings = localGetSettings()
    if (savedSettings) {
      setSettings(savedSettings)
    } else {
      localSetSettings(DEFAULT_SETTINGS)
    }
    setLoaded(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auth state listener ───────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // ── Username dérivé de l'email Supabase ───────────────────
  const getUsername = useCallback(
    () => (user?.email ? fromEmail(user.email) : undefined),
    [user],
  )

  // ── Sync trigger ──────────────────────────────────────────
  // En mode Full Cloud :
  //   • Les fill-ups locaux non-synced sont poussés vers Supabase.
  //   • Le profil (settings) est tiré depuis Supabase — le serveur fait autorité.
  //   • Les fill-ups distants sont mergés avec le non-synced local.
  const triggerSync = useCallback(async () => {
    if (!user || syncLock.current) return
    syncLock.current = true
    setSyncStatus('syncing')
    try {
      const { fillUps: merged, remoteSettings } = await fullSync(user.id)

      // Applique les settings distants (source de vérité = serveur).
      // Merge avec DEFAULT_SETTINGS pour garantir que tous les champs existent.
      if (remoteSettings) {
        applySettings({ ...DEFAULT_SETTINGS, ...remoteSettings })
      }

      setFillUps(merged)
      setSyncStatus('synced')
    } catch {
      setSyncStatus('error')
    } finally {
      syncLock.current = false
      setTimeout(() => setSyncStatus((s) => (s === 'synced' ? 'idle' : s)), 3000)
    }
  }, [user, applySettings])

  // ── Sync on online + on auth ──────────────────────────────
  useEffect(() => {
    if (!user) return

    triggerSync()

    const handleOnline = () => triggerSync()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [user, triggerSync])

  // ── Auth helpers ──────────────────────────────────────────
  const signIn = useCallback(async (pseudo: string, password: string): Promise<string | null> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: toEmail(pseudo),
      password,
    })
    if (error) return error.message

    // Filet de sécurité : crée le profil s'il est absent
    if (data.user) {
      const localSettings = localGetSettings()
      await ensureProfile(data.user.id, pseudo.trim().toLowerCase(), localSettings ?? undefined)
    }
    return null
  }, [])

  const signUp = useCallback(async (pseudo: string, password: string): Promise<string | null> => {
    const { data, error } = await supabase.auth.signUp({
      email: toEmail(pseudo),
      password,
      options: {
        data: { username: pseudo.trim().toLowerCase() },
        emailRedirectTo: undefined,
      },
    })
    if (error) return error.message

    // Crée immédiatement le profil côté client (ne pas attendre le trigger)
    if (data.user) {
      const localSettings = localGetSettings()
      await ensureProfile(data.user.id, pseudo.trim().toLowerCase(), localSettings ?? undefined)
    }
    return null
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  // ── Reset complet (localStorage + Supabase) ───────────────
  const resetAllData = useCallback(async () => {
    // 1. Vider l'état React immédiatement (UX réactive)
    setFillUps([])
    setSettings(DEFAULT_SETTINGS)
    // 2. Vider le localStorage
    localSetFillUps([])
    localSetSettings(DEFAULT_SETTINGS)
    // 3. Supprimer les données dans Supabase si connecté
    if (user) {
      await purgeUserData(user.id)
    }
  }, [user])

  // ── CRUD ──────────────────────────────────────────────────
  const addFillUp = useCallback(
    (fillUp: Omit<FillUp, 'id'>) => {
      const newFillUp: FillUp = {
        ...fillUp,
        id: crypto.randomUUID(),
        _synced: false,
      }
      const updated = [newFillUp, ...fillUps].sort((a, b) => b.date.localeCompare(a.date))
      applyFillUps(updated)

      // Push en background si connecté
      if (user) {
        pushPending(user.id).then(() => {
          setFillUps((prev) =>
            prev.map((f) => (f.id === newFillUp.id ? { ...f, _synced: true } : f)),
          )
        })
      }
    },
    [fillUps, applyFillUps, user],
  )

  const updateFillUp = useCallback(
    (id: string, fillUp: Omit<FillUp, 'id'>) => {
      const updated = fillUps
        .map((f) => (f.id === id ? { ...fillUp, id, _synced: false } : f))
        .sort((a, b) => b.date.localeCompare(a.date))
      applyFillUps(updated)

      if (user) {
        pushPending(user.id).then(() => {
          setFillUps((prev) =>
            prev.map((f) => (f.id === id ? { ...f, _synced: true } : f)),
          )
        })
      }
    },
    [fillUps, applyFillUps, user],
  )

  const deleteFillUp = useCallback(
    (id: string) => {
      // 1. Mise à jour locale immédiate (UI réactive)
      applyFillUps(fillUps.filter((f) => f.id !== id))

      // 2. Suppression directe dans Supabase si connecté.
      //    On ne passe plus par pushPending/soft-delete : le soft-delete retirait l'item
      //    de localStorage AVANT que pushPending puisse le lire, donc Supabase ne recevait rien.
      if (user) {
        supabase
          .from('fill_ups')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id)
          .then(({ error }) => {
            if (error) console.error('[Delete] Supabase error:', error.message)
          })
      }
    },
    [fillUps, applyFillUps, user],
  )

  const updateSettings = useCallback(
    (partial: Partial<Settings>) => {
      const updated = { ...settings, ...partial }
      applySettings(updated)

      if (user) {
        import('@/lib/syncManager').then(({ syncSettings }) =>
          syncSettings(user.id, updated, getUsername()),
        )
      }
    },
    [settings, applySettings, user, getUsername],
  )

  // ── Pull remote si déjà connecté au retour sur l'app ──────
  useEffect(() => {
    if (!user || !loaded) return
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') triggerSync()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [user, loaded, triggerSync])

  if (!loaded) return null

  return (
    <AppContext.Provider
      value={{
        fillUps,
        settings,
        addFillUp,
        updateFillUp,
        deleteFillUp,
        updateSettings,
        user,
        authLoading,
        signIn,
        signUp,
        signOut,
        syncStatus,
        pendingCount,
        triggerSync,
        resetAllData,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
