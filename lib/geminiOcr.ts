/**
 * Octrack — Extracteur Gemini Vision
 *
 * ── PIPELINE ─────────────────────────────────────────────────────────────────
 *   ① compressImage()  — redimensionne + JPEG 0.82 → garantit < 900 KB
 *      (Vercel Edge limit = 4.5 MB body ; photos smartphone = 3-8 MB raw)
 *   ② savePendingPhoto() → IndexedDB AVANT tout appel réseau
 *   ③ fetch('/api/ocr')  → Gemini 1.5 Flash
 *   ④ Succès  : deletePendingPhoto(id)   → résultat propre
 *      Échec   : photo conservée IndexedDB, { pendingOffline: true }
 *
 * ── POURQUOI LA COMPRESSION EST CRITIQUE ─────────────────────────────────────
 *   Vercel Edge Functions : limite de 4.5 MB sur le corps de la requête.
 *   Un JPEG de smartphone = 2-8 MB → base64 = ×1.33 = 2.7-11 MB.
 *   Sans compression : POST silencieusement tronqué / 413 → offline systématique.
 *   Avec canvas 1024 px + qualité 82% : ~150-350 KB → bien sous la limite.
 */

import type { OcrExtracted } from '@/lib/ocrExtract'
import { validateAndFix } from '@/lib/ocrExtract'
import { savePendingPhoto, deletePendingPhoto } from '@/lib/offlineQueue'

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Dimension max (px) du côté le plus long — au-delà, Gemini n'apporte rien de plus. */
const MAX_IMAGE_PX = 1024
/** Qualité JPEG : 0.82 = bon compromis netteté des chiffres / taille fichier. */
const JPEG_QUALITY  = 0.82
/** Timeout du fetch côté client — en dessous du max Vercel Edge (25 s Hobby, 60 s Pro). */
const CLIENT_TIMEOUT_MS = 22_000

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compresse et redimensionne l'image via canvas.
 *
 * Retourne : { base64, mimeType: 'image/jpeg', blob, sizeKB }
 * Lance une erreur si le canvas échoue (environnement non-browser).
 */
async function compressImage(
  url:     string,
  maxPx =  MAX_IMAGE_PX,
  quality = JPEG_QUALITY,
): Promise<{ base64: string; mimeType: string; blob: Blob; sizeKB: number }> {
  // 1. Charger le bitmap
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image   = new Image()
    image.onload  = () => resolve(image)
    image.onerror = () => reject(new Error('Impossible de charger l\'image dans HTMLImageElement'))
    image.src     = url
  })

  // 2. Calculer les nouvelles dimensions (ratio préservé)
  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height))
  const w     = Math.max(1, Math.round((img.naturalWidth  || img.width)  * scale))
  const h     = Math.max(1, Math.round((img.naturalHeight || img.height) * scale))

  // 3. Redimensionner sur canvas
  const canvas = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context non disponible')
  ctx.drawImage(img, 0, 0, w, h)

  // 4. Exporter en JPEG + lire en base64
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('canvas.toBlob a retourné null')); return }

        const reader     = new FileReader()
        reader.onloadend = () => {
          const dataUrl  = reader.result as string
          const sep      = dataUrl.indexOf(',')
          const base64   = dataUrl.slice(sep + 1)
          const sizeKB   = Math.round(blob.size / 1024)
          resolve({ base64, mimeType: 'image/jpeg', blob, sizeKB })
        }
        reader.onerror = () => reject(new Error('FileReader error'))
        reader.readAsDataURL(blob)
      },
      'image/jpeg',
      quality,
    )
  })
}

// ─── Export principal ─────────────────────────────────────────────────────────

/**
 * Lance l'extraction Gemini Vision sur une photo de pompe.
 *
 * @param imageUrl   URL locale (blob: ou data:) créée par URL.createObjectURL
 * @param onProgress Callback 0-100 pour la barre de progression
 * @param fuelType   Optionnel — stocké dans la file offline pour le retry
 */
export async function runOcr(
  imageUrl:   string,
  onProgress: (pct: number) => void,
  fuelType?:  string,
): Promise<OcrExtracted> {
  onProgress(5)

  // ── ① Compression canvas ──────────────────────────────────────────────────
  // CRITIQUE : réduit l'image à ≤ 900 KB pour passer sous la limite Vercel (4.5 MB)
  let base64   = ''
  let mimeType = 'image/jpeg'
  let blob: Blob | undefined

  try {
    const compressed = await compressImage(imageUrl)
    base64   = compressed.base64
    mimeType = compressed.mimeType
    blob     = compressed.blob
    console.info(
      `[GeminiOCR] Image compressée → ${compressed.sizeKB} KB ` +
      `(limite Vercel Edge : 4 500 KB)`,
    )
  } catch (compressErr) {
    // Fallback : lire l'image brute sans compression (iOS vieux, contexte SSR...)
    console.warn('[GeminiOCR] Compression échouée — envoi image brute:', compressErr)
    try {
      const res = await fetch(imageUrl)
      blob      = await res.blob()
      const reader = new FileReader()
      const raw    = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror   = reject
        reader.readAsDataURL(blob!)
      })
      const sep = raw.indexOf(',')
      base64    = raw.slice(sep + 1)
      mimeType  = blob.type || 'image/jpeg'
      console.warn(`[GeminiOCR] Image brute : ${Math.round(blob.size / 1024)} KB — risque 413`)
    } catch (rawErr) {
      console.error('[GeminiOCR] Impossible de lire l\'image:', rawErr)
    }
  }

  onProgress(25)

  // ── ② Sauvegarde préventive IndexedDB ────────────────────────────────────
  let offlineId: string | undefined
  try {
    if (blob) offlineId = await savePendingPhoto(blob, fuelType)
  } catch (idbErr) {
    // IndexedDB peut être désactivé (navigation privée Safari) — non bloquant
    console.warn('[GeminiOCR] IndexedDB indisponible:', idbErr)
  }

  onProgress(32)

  // ── ③ Appel API /api/ocr ──────────────────────────────────────────────────
  //
  // La route retourne TOUJOURS HTTP 200 (sauf 429 quota).
  // Les erreurs Gemini sont dans le body JSON : { error, message, geminiRaw }.
  // Seules les exceptions fetch() (réseau coupé, timeout) → pendingOffline.
  let apiResult: {
    total:         number | null
    volume:        number | null
    pricePerLiter: number | null
    error?:        string
    message?:      string
    retryAfter?:   number
    offline?:      boolean
  }

  try {
    const res = await fetch('/api/ocr', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ imageBase64: base64, mimeType }),
      signal:  AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    })

    onProgress(80)

    const bodyText = await res.text()

    // 429 — Quota Gemini — seul cas non-200 restant
    if (res.status === 429) {
      let retryAfter = 60
      try {
        const parsed = JSON.parse(bodyText) as { retryAfter?: number }
        if (typeof parsed.retryAfter === 'number') retryAfter = parsed.retryAfter
      } catch { /* body non-JSON */ }
      console.warn(`[GeminiOCR] Quota Gemini dépassé — retry in ${retryAfter}s`)
      return { preprocessedUrl: imageUrl, pendingOffline: true, offlineQueueId: offlineId, quotaError: true, retryAfter }
    }

    try {
      apiResult = JSON.parse(bodyText)
    } catch {
      console.error('[GeminiOCR] Body non-JSON de /api/ocr:', bodyText.slice(0, 200))
      return { preprocessedUrl: imageUrl, errorMessage: `Réponse illisible du serveur : ${bodyText.slice(0, 100)}`, fromGemini: true }
    }

    // La route a signalé une erreur réseau/timeout côté serveur
    if (apiResult.offline) {
      console.error('[GeminiOCR] Timeout/réseau côté serveur:', apiResult.message)
      return { preprocessedUrl: imageUrl, pendingOffline: true, offlineQueueId: offlineId }
    }

    // Erreur API Gemini (safety, clé invalide, format…) — PAS un problème réseau
    if (apiResult.error) {
      const msg = apiResult.message ?? apiResult.error
      console.error(`[GeminiOCR] ❌ Erreur Gemini [${apiResult.error}]: ${msg}`)
      // Pas pendingOffline — l'utilisateur doit voir le message exact, pas "hors-ligne"
      return {
        preprocessedUrl: imageUrl,
        fromGemini:      true,
        errorMessage:    msg,
      }
    }

  } catch (fetchErr) {
    // Exception fetch = vrai problème réseau (DNS, TCP, timeout client)
    const isTimeout = fetchErr instanceof DOMException && fetchErr.name === 'TimeoutError'
    const isOffline = !navigator.onLine
    console.error(
      `[GeminiOCR] ${isTimeout ? '⏱ Timeout client' : isOffline ? '📵 Hors-ligne' : '🌐 Réseau'}:`,
      fetchErr,
    )
    return { preprocessedUrl: imageUrl, pendingOffline: true, offlineQueueId: offlineId }
  }

  onProgress(90)

  // ── ④ Succès — supprimer de la file offline ───────────────────────────────
  if (offlineId) {
    deletePendingPhoto(offlineId).catch(() => { /* Non bloquant */ })
  }

  // ── ⑤ Construction du résultat ────────────────────────────────────────────
  let result: OcrExtracted = {
    liters:        apiResult.volume        ?? undefined,
    pricePerLiter: apiResult.pricePerLiter ?? undefined,
    totalCost:     apiResult.total         ?? undefined,

    litersConf:        apiResult.volume        != null ? 0.93 : undefined,
    pricePerLiterConf: apiResult.pricePerLiter != null ? 0.93 : undefined,
    totalCostConf:     apiResult.total         != null ? 0.93 : undefined,

    preprocessedUrl: imageUrl,
    fromGemini:      true,
  }

  // Dériver prix/litre si Gemini ne l'a pas fourni
  if (result.liters && result.totalCost && !result.pricePerLiter) {
    const derived = result.totalCost / result.liters
    if (derived > 0.9 && derived < 3.0) {
      result.pricePerLiter     = parseFloat(derived.toFixed(3))
      result.pricePerLiterConf = 0.90
    }
  }

  // Rescue mathématique (virgule décalée)
  result = validateAndFix(result)

  console.info(
    '[GeminiOCR] ✅ Extraction réussie :',
    `L=${result.liters ?? 'null'} L,`,
    `total=${result.totalCost ?? 'null'} €,`,
    `PPL=${result.pricePerLiter ?? 'null'} €/L`,
  )

  onProgress(100)
  return result
}
