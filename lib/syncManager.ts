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
const LS_FILLUPS   = 'octrack_fillups'
const LS_SETTINGS  = 'octrack_settings'

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

  const remoteMap = new Map<string, FillUp>(
    (data ?? []).map((r) => [r.id, fromRow(r)]),
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

// ── Full sync (push then pull) ────────────────────────────────
export async function fullSync(
  userId: string,
  settings: Settings,
  username?: string,
): Promise<FillUp[]> {
  await pushPending(userId)
  await syncSettings(userId, settings, username)
  return pullRemote(userId)
}
