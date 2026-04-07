/**
 * Octrack — File de synchronisation hors-ligne
 *
 * ── POURQUOI IndexedDB ET PAS localStorage ─────────────────────────────────
 * localStorage est limité à ~5 Mo. Une photo JPEG de pompe = 2-5 Mo.
 * Sur iOS, la limite effective est souvent 2 Mo avant blocage silencieux.
 * IndexedDB, lui :
 *   • Stocke des Blob natifs — pas besoin d'encoder en base64 (×1.33 overhead)
 *   • Persiste à travers les crashes, les mises en veille, les kills du process
 *   • Quota géré par le navigateur (≥ 50 Mo sur la plupart des dispositifs)
 *   • Fonctionne en background service worker (si ajouté plus tard)
 *
 * ── CYCLE DE VIE D'UNE PHOTO ──────────────────────────────────────────────
 *   1. savePendingPhoto(blob)  → entrée créée, status: 'pending'
 *   2. Appel Gemini réussi     → deletePendingPhoto(id) — plus rien
 *   3. Appel Gemini échoué     → entrée conservée, retry possible depuis l'historique
 *
 * ── ACCÈS DEPUIS L'HISTORIQUE (futur) ────────────────────────────────────
 *   getPendingPhotos() → liste des photos en attente
 *   Chaque entrée contient le Blob original — prêt pour un retry Gemini.
 */

const DB_NAME    = 'octrack_offline_v1'
const STORE_NAME = 'photo_queue'
const DB_VERSION = 1

export interface PendingPhotoEntry {
  id:        string
  timestamp: number
  blob:      Blob       // image native — IndexedDB stocke les Blob directement
  fuelType?: string     // pour pré-remplir le formulaire au moment du retry
  status:    'pending'
}

// ─── Ouverture / création de la base ─────────────────────────────────────────

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponible (environnement SSR ?)'))
      return
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Sauvegarde une photo dans la file d'attente.
 * Retourne l'identifiant unique de l'entrée.
 */
export async function savePendingPhoto(blob: Blob, fuelType?: string): Promise<string> {
  const db    = await openQueue()
  const id    = `ph_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const entry: PendingPhotoEntry = {
    id,
    timestamp: Date.now(),
    blob,
    fuelType,
    status: 'pending',
  }

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req   = store.put(entry)
    req.onsuccess = () => resolve(id)
    req.onerror   = () => reject(req.error)
  })
}

/**
 * Récupère toutes les photos en attente d'analyse.
 * Utilisé par l'écran Historique pour le bouton "Analyser maintenant".
 */
export async function getPendingPhotos(): Promise<PendingPhotoEntry[]> {
  const db = await openQueue()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req   = store.getAll()
    req.onsuccess = () => resolve(req.result ?? [])
    req.onerror   = () => reject(req.error)
  })
}

/**
 * Supprime une entrée après analyse réussie.
 */
export async function deletePendingPhoto(id: string): Promise<void> {
  const db = await openQueue()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req   = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

/**
 * Retourne le nombre de photos en attente.
 * Utile pour afficher un badge de notification dans l'interface.
 */
export async function countPendingPhotos(): Promise<number> {
  try {
    const db = await openQueue()
    return new Promise((resolve) => {
      const tx    = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req   = store.count()
      req.onsuccess = () => resolve(req.result ?? 0)
      req.onerror   = () => resolve(0)
    })
  } catch {
    return 0
  }
}
