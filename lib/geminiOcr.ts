/**
 * Octrack — Extracteur Gemini Vision
 * Remplace le pipeline Tesseract (lib/ocrExtract.ts préprocessing).
 *
 * ── STRATÉGIE HORS-LIGNE ─────────────────────────────────────────────────────
 * La photo est sauvegardée dans IndexedDB AVANT tout appel réseau.
 * Ainsi, même si :
 *   • L'app est fermée pendant l'envoi
 *   • Le réseau coupe entre la capture et l'upload
 *   • iOS termine le processus en arrière-plan
 * → la photo est conservée et pourra être analysée au prochain lancement.
 *
 * Cycle de vie :
 *   ① savePendingPhoto(blob) → IndexedDB, status: 'pending'
 *   ② fetch('/api/ocr') → Gemini 1.5 Flash
 *   ③ Succès : deletePendingPhoto(id) + retourne OcrExtracted
 *   ④ Échec  : entrée conservée, retourne { pendingOffline: true }
 */

import type { OcrExtracted } from '@/lib/ocrExtract'
import { validateAndFix } from '@/lib/ocrExtract'
import { savePendingPhoto, deletePendingPhoto } from '@/lib/offlineQueue'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convertit une URL (blob: ou data:) en base64 + mimeType. */
async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string; blob: Blob }> {
  const res  = await fetch(url)
  const blob = await res.blob()

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl  = reader.result as string
      const [header] = dataUrl.split(',')
      const base64   = dataUrl.slice(header.length + 1)
      const mimeType = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg'
      resolve({ base64, mimeType, blob })
    }
    reader.onerror = () => reject(new Error('FileReader error'))
    reader.readAsDataURL(blob)
  })
}

// ─── Export principal ─────────────────────────────────────────────────────────

/**
 * Lance l'extraction Gemini Vision sur une photo de pompe.
 *
 * @param imageUrl   URL locale (blob: ou data:) — créée par URL.createObjectURL
 * @param onProgress Callback 0-100 pour la barre de progression
 * @param fuelType   Optionnel — stocké dans la file offline pour le retry
 */
export async function runOcr(
  imageUrl:   string,
  onProgress: (pct: number) => void,
  fuelType?:  string,
): Promise<OcrExtracted> {
  onProgress(8)

  // ── ① Sauvegarde préventive IndexedDB ────────────────────────────────────
  // La photo est stockée AVANT l'appel API.
  // Si l'app est fermée pendant l'upload → photo conservée, rien n'est perdu.
  let offlineId: string | undefined
  let blob: Blob | undefined
  let base64 = ''
  let mimeType = 'image/jpeg'

  try {
    const encoded = await urlToBase64(imageUrl)
    base64        = encoded.base64
    mimeType      = encoded.mimeType
    blob          = encoded.blob
    offlineId     = await savePendingPhoto(blob, fuelType)
  } catch (err) {
    console.warn('[GeminiOCR] Préparation image échouée:', err)
    // On continue — l'absence de filet IndexedDB n'est pas bloquante
  }

  onProgress(28)

  // ── ② Appel API Gemini ────────────────────────────────────────────────────
  let apiResult: {
    total: number | null
    volume: number | null
    pricePerLiter: number | null
  }

  try {
    const res = await fetch('/api/ocr', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ imageBase64: base64, mimeType }),
      signal:  AbortSignal.timeout(25_000), // 25 secondes max
    })

    onProgress(82)

    if (!res.ok) {
      throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`)
    }

    apiResult = await res.json()

  } catch (err) {
    // Réseau coupé, timeout, ou API error → photo déjà en IndexedDB
    const isOffline = !navigator.onLine || (err instanceof TypeError && err.message.includes('fetch'))
    console.warn(`[GeminiOCR] ${isOffline ? 'Hors-ligne' : 'Erreur API'}:`, err)

    return {
      preprocessedUrl: imageUrl,
      pendingOffline:  true,
      offlineQueueId:  offlineId,
    }
  }

  onProgress(90)

  // ── ③ Succès : supprimer de la file offline ───────────────────────────────
  if (offlineId) {
    deletePendingPhoto(offlineId).catch(() => {
      // Suppression non-bloquante — la prochaine analyse normale nettoiera
    })
  }

  // ── ④ Construction du résultat ────────────────────────────────────────────
  let result: OcrExtracted = {
    liters:        apiResult.volume        ?? undefined,
    pricePerLiter: apiResult.pricePerLiter ?? undefined,
    totalCost:     apiResult.total         ?? undefined,

    // Confiance élevée — Gemini lit nativement les images sans preprocessing
    litersConf:        apiResult.volume        != null ? 0.93 : undefined,
    pricePerLiterConf: apiResult.pricePerLiter != null ? 0.93 : undefined,
    totalCostConf:     apiResult.total         != null ? 0.93 : undefined,

    preprocessedUrl: imageUrl, // photo originale pour l'aperçu
    fromGemini:      true,
  }

  // Dériver prix/litre si Gemini ne l'a pas fourni mais a L et total
  if (result.liters && result.totalCost && !result.pricePerLiter) {
    const derived = result.totalCost / result.liters
    if (derived > 0.9 && derived < 3.0) {
      result.pricePerLiter     = parseFloat(derived.toFixed(3))
      result.pricePerLiterConf = 0.90
    }
  }

  // Rescue mathématique (virgule décalée sur l'un des champs)
  result = validateAndFix(result)

  onProgress(100)
  return result
}
