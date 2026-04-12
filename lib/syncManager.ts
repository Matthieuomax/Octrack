/**
 * Octrack — SyncManager
 * Synchronisation locale ↔ Supabase (offline-first, client-wins)
 *
 * Principe :
 *  - Tout plein est d'abord écrit dans localStorage avec _synced: false
 *  - À chaque sync(), on push les non-synced puis on pull les distants
 *  - Les suppressions utilisent le flag _deletedAt (soft delete)
 */

import { supabase } from './supabase'
import type { FillUp, Settings } from './types'

// ── Helpers localStorage ──────────────────────────────────────
const LS_FILLUPS          = 'octrack_fillups'
const LS_SETTINGS         = 'octrack_settings'
const LS_PENDING_DELETES  = 'octrack_pending_deletes'

// File d'attente des suppressions : les IDs à supprimer dans Supabase.
// Stockée dans localStorage pour survivre à un refresh avant que la requête aboutisse.
export function localGetPendingDeletes(): string[] {
  try {
    const raw = localStorage.getItem(LS_PENDING_DELETES)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function localAddPendingDelete(id: string): void {
  try {
    const ids = localGetPendingDeletes()
    if (!ids.includes(id)) {
      localStorage.setItem(LS_PENDING_DELETES, JSON.stringify([...ids, id]))
    }
  } catch { /* ignore */ }
}

function localClearPendingDeletes(): void {
  localStorage.removeItem(LS_PENDING_DELETES)
}

export function localGetFillUps(): FillUp[] {
  try {
    const raw = localStorage.getItem(LS_FILLUPS)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function localSetFillUps(fillUps: FillUp[]): void {
  localStorage.setItem(LS_FILLUPS, JSON.stringify(fillUps))
}

export function localGetSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(LS_SETTINGS)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function localSetSettings(s: Settings): void {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(s))
}

// ── Conversion FillUp ↔ row Supabase ─────────────────────────
function toRow(f: FillUp, userId: string) {
  return {
    id:              f.id,
    user_id:         userId,
    date:            f.date,
    liters:          f.liters,
    price_per_liter: f.pricePerLiter,
    total_cost:      f.totalCost,
    km:              f.km ?? null,
    station:         f.station ?? null,
    notes:           f.notes ?? null,
    fuel_type:       f.fuelType ?? null,
    deleted_at:      f._deletedAt ?? null,
    updated_at:      new Date().toISOString(),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): FillUp {
  return {
    id:            r.id,
    date:          r.date,
    liters:        Number(r.liters),
    pricePerLiter: Number(r.price_per_liter),
    totalCost:     Number(r.total_cost),
    km:            r.km != null ? Number(r.km) : undefined,
    station:       r.station ?? undefined,
    notes:         r.notes ?? undefined,
    fuelType:      r.fuel_type ?? undefined,
    _synced:       true,
    _deletedAt:    r.deleted_at ?? undefined,
  }
}

// ── Push : envoie les non-synced vers Supabase ─────────────────
export async function pushPending(userId: string): Promise<void> {
  const all = localGetFillUps()
  const pending = all.filter((f) => !f._synced)
  if (!pending.length) return

  const rows = pending.map((f) => toRow(f, userId))

  const { error } = await supabase
    .from('fill_ups')
    .upsert(rows, { onConflict: 'id' })

  if (error) {
    console.error('[Sync] push error:', error.message)
    return
  }

  // Marquer comme synced localement
  const updated = all.map((f) =>
    pending.find((p) => p.id === f.id) ? { ...f, _synced: true } : f,
  )
  localSetFillUps(updated)
}

// ── Pull : récupère les données distantes et merge ─────────────
export async function pullRemote(userId: string): Promise<FillUp[]> {
  const { data, error } = await supabase
    .from('fill_ups')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })

  if (error) {
    console.error('[Sync] pull error:', error.message)
    return localGetFillUps()
  }

  // Filtre défensif : les IDs d'exemple (s1–s12) ne doivent JAMAIS remonter
  // même s'ils ont été poussés dans Supabase par une ancienne version de l'app.
  const remoteMap = new Map<string, FillUp>(
    (data ?? [])
      .filter((r) => !/^s\d+$/.test(r.id))
      .map((r) => [r.id, fromRow(r)]),
  )

  // Overlay local non-synced par-dessus les distants
  const local = localGetFillUps()
  for (const f of local) {
    if (!f._synced) remoteMap.set(f.id, f)
  }

  const merged = [...remoteMap.values()]
    // Exclure les soft-deleted
    .filter((f) => !f._deletedAt)
    .sort((a, b) => b.date.localeCompare(a.date))

  localSetFillUps(merged)
  return merged
}

// ── Ensure profile exists (appelé après chaque auth) ──────────
// Crée la ligne si elle n'existe pas, ne touche à rien si elle existe déjà.
export async function ensureProfile(
  userId: string,
  username: string,
  settings?: Partial<Settings>,
): Promise<void> {
  if (!username) {
    console.error('[Sync] ensureProfile: username vide, abandon')
    return
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (existing) return // profil déjà présent — ne rien écraser

  const { error } = await supabase.from('profiles').insert({
    id:            userId,
    username:      username.trim().toLowerCase(),
    car_brand:     settings?.carBrand     || null,
    car_model:     settings?.carModel     || null,
    car_year:      settings?.carYear      || null,
    tank_capacity: settings?.tankCapacity || null,
    fuel_type:     settings?.fuelType     ?? 'sp95',
    theme:         settings?.theme        ?? 'dark',
  })

  if (error) console.error('[Sync] ensureProfile insert error:', error.message)
}

// ── Sync settings ↔ Supabase profiles ─────────────────────────
// username est requis uniquement si le profil peut ne pas exister encore.
// On utilise deux opérations distinctes :
//   1. UPDATE sur les colonnes settings (jamais de null username)
//   2. Si aucune ligne touchée → ensureProfile crée la ligne complète
export async function syncSettings(
  userId: string,
  settings: Settings,
  username?: string,
): Promise<void> {
  const settingsPayload = {
    car_brand:     settings.carBrand    || null,
    car_model:     settings.carModel    || null,
    car_year:      settings.carYear     || null,
    tank_capacity: settings.tankCapacity || null,
    fuel_type:     settings.fuelType,
    theme:         settings.theme,
    updated_at:    new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(settingsPayload)
    .eq('id', userId)
    .select('id')

  if (error) {
    console.error('[Sync] syncSettings update error:', error.message)
    return
  }

  // Si aucune ligne mise à jour → le profil n'existe pas encore → le créer
  if ((data?.length ?? 0) === 0 && username) {
    await ensureProfile(userId, username, settings)
  }
}

// ── Fetch profile → Settings ──────────────────────────────────
export async function fetchProfile(userId: string): Promise<Partial<Settings> | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return null

  return {
    carBrand:     data.car_brand    ?? '',
    carModel:     data.car_model    ?? '',
    carYear:      data.car_year     ?? '',
    tankCapacity: data.tank_capacity ? Number(data.tank_capacity) : 50,
    fuelType:     data.fuel_type    ?? 'sp95',
    theme:        data.theme        ?? 'dark',
  }
}

// ── Traitement des suppressions en attente ────────────────────
// Envoie à Supabase les suppressions qui auraient échoué ou qui n'ont pas eu le
// temps de partir avant un refresh (fire-and-forget interrompu par navigation).
export async function processPendingDeletes(userId: string): Promise<void> {
  const ids = localGetPendingDeletes()
  if (!ids.length) return

  const { error } = await supabase
    .from('fill_ups')
    .delete()
    .eq('user_id', userId)
    .in('id', ids)

  if (!error) {
    localClearPendingDeletes()
  } else {
    console.error('[Sync] processPendingDeletes error:', error.message)
  }
}

// ── Purge des IDs d'exemple dans Supabase (one-shot par appareil) ────────────
// Les versions précédentes de l'app poussaient les fill-ups d'exemple (s1–s12)
// dans Supabase. Cette fonction les supprime une seule fois, puis mémorise
// l'opération dans localStorage pour ne plus la rejouer.
const LS_SAMPLE_PURGED = 'octrack_sample_purged'

async function purgeSampleRows(userId: string): Promise<void> {
  try {
    if (localStorage.getItem(LS_SAMPLE_PURGED)) return
    const SAMPLE_IDS = ['s1','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11','s12']
    const { error } = await supabase
      .from('fill_ups')
      .delete()
      .eq('user_id', userId)
      .in('id', SAMPLE_IDS)
    if (!error) localStorage.setItem(LS_SAMPLE_PURGED, '1')
    else console.warn('[Sync] purgeSampleRows:', error.message)
  } catch { /* non bloquant */ }
}

// ── Suppression totale des données utilisateur (reset depuis les réglages) ─────
export async function purgeUserData(userId: string): Promise<void> {
  // Supprime TOUS les fill-ups de l'utilisateur dans Supabase
  const { error } = await supabase
    .from('fill_ups')
    .delete()
    .eq('user_id', userId)
  if (error) console.error('[Sync] purgeUserData error:', error.message)
  // Réinitialise aussi le flag de purge pour qu'il n'y ait pas de résidus
  localStorage.removeItem(LS_SAMPLE_PURGED)
}

// ── Full sync ─────────────────────────────────────────────────
// Principe Full Cloud :
//  1. Push les fill-ups locaux non-synced → Supabase
//  2. Récupère le profil (settings) → source de vérité = serveur
//  3. Pull les fill-ups distants et merge avec le non-synced local
//
// ⚠ NE pousse plus les settings ici — ils sont poussés immédiatement
//   dans updateSettings (AppContext) dès que l'utilisateur fait un choix.
//   Pousser les settings dans fullSync risquerait d'écraser le profil
//   serveur avec les valeurs par défaut du nouvel appareil.
export async function fullSync(
  userId: string,
): Promise<{ fillUps: FillUp[]; remoteSettings: Partial<Settings> | null }> {
  // 1. Supprime les IDs en attente (suppressions interrompues par un refresh)
  await processPendingDeletes(userId)
  // 2. Purge one-shot des IDs d'exemple hérités d'anciennes versions
  await purgeSampleRows(userId)
  // 3. Pousse les fill-ups non-synced
  await pushPending(userId)
  // 4. Récupère le profil et les fill-ups depuis Supabase
  const remoteSettings = await fetchProfile(userId)
  const fillUps = await pullRemote(userId)
  return { fillUps, remoteSettings }
}
