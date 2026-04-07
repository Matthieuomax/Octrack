/**
 * Octrack — OCR Types & Vérification Mathématique
 *
 * Version allégée : l'extraction est maintenant assurée par Gemini Vision
 * via lib/geminiOcr.ts → app/api/ocr.
 *
 * Ce module conserve uniquement :
 *   - Les interfaces de données (OcrExtracted, OcrWord, MathVerdict)
 *   - mathCheck()     — vérification de cohérence du triplet (L, €/L, total)
 *   - validateAndFix() — correction automatique des virgules décalées
 */

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export interface OcrWord {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

export interface OcrExtracted {
  liters?: number
  pricePerLiter?: number
  totalCost?: number
  litersConf?: number
  pricePerLiterConf?: number
  totalCostConf?: number
  rawText?: string
  preprocessedUrl?: string
  words?: OcrWord[]
  imgW?: number
  imgH?: number
  zoneLog?: string[]
  /** true si l'extraction vient de Gemini Vision (vs Tesseract legacy) */
  fromGemini?: boolean
  /** true si l'appel Gemini a échoué et que la photo est en file hors-ligne */
  pendingOffline?: boolean
  /** Identifiant dans la file IndexedDB (lib/offlineQueue.ts) */
  offlineQueueId?: string
}

// ─────────────────────────────────────────────────────────────
// VÉRITÉ PAR LE RATIO — Validation mathématique
// ─────────────────────────────────────────────────────────────
//
// Sur une pompe française, prix/litre est TOUJOURS dans [0.90, 3.00 €/L].
// Ce critère permet de valider ou d'invalider un triplet extrait.

export interface MathVerdict {
  /** true si le triplet (liters, totalCost, pricePerLiter) est cohérent */
  consistent: boolean
  /** Prix/litre dérivé de totalCost/liters */
  derivedPpl: number | null
  fixApplied?: 'totalCost' | 'liters'
  hint?: string
}

export function mathCheck(
  liters?: number,
  totalCost?: number,
  pricePerLiter?: number,
): MathVerdict {
  if (!liters || !totalCost) return { consistent: false, derivedPpl: null }

  const derived = totalCost / liters

  if (derived >= 0.9 && derived <= 3.0) {
    const pplOk = !pricePerLiter || Math.abs(pricePerLiter - derived) / derived < 0.08
    return {
      consistent: true,
      derivedPpl: parseFloat(derived.toFixed(3)),
      hint: pplOk
        ? undefined
        : `Prix/L déclaré (${pricePerLiter}) ≠ dérivé (${derived.toFixed(3)})`,
    }
  }

  let hint = `Ratio ${derived.toFixed(2)} hors plage [0.90-3.00]`
  if (derived > 3.0 && derived < 30.0) {
    const cand = (totalCost / 10) / liters
    if (cand >= 0.9 && cand <= 3.0)
      hint = `Total probable : ${(totalCost / 10).toFixed(2)} € — virgule décalée ?`
  } else if (derived > 30.0) {
    const cand = totalCost / (liters * 10)
    if (cand >= 0.9 && cand <= 3.0)
      hint = `Volume probable : ${(liters * 10).toFixed(2)} L — virgule décalée ?`
  } else if (derived < 0.9 && derived > 0.09) {
    const cand1 = (totalCost * 10) / liters
    if (cand1 >= 0.9 && cand1 <= 3.0)
      hint = `Total probable : ${(totalCost * 10).toFixed(2)} € — virgule décalée ?`
  }

  return { consistent: false, derivedPpl: null, hint }
}

/**
 * Tente de corriger un résultat incohérent en décalant la virgule.
 * Confiance réduite de 30 % sur la valeur corrigée.
 */
export function validateAndFix(result: OcrExtracted): OcrExtracted {
  const { liters, totalCost } = result
  if (!liters || !totalCost) return result

  const ratio = totalCost / liters
  if (ratio >= 0.9 && ratio <= 3.0) return result

  const FACTORS = [10, 0.1, 100, 0.01]

  for (const f of FACTORS) {
    const shifted = totalCost * f
    if (shifted < 1 || shifted > 999) continue
    const r = shifted / liters
    if (r >= 0.9 && r <= 3.0) {
      return {
        ...result,
        totalCost:         parseFloat(shifted.toFixed(2)),
        totalCostConf:     (result.totalCostConf ?? 0.5) * 0.70,
        pricePerLiter:     parseFloat(r.toFixed(3)),
        pricePerLiterConf: 0.72,
      }
    }
  }

  for (const f of FACTORS) {
    const shifted = liters * f
    if (shifted < 0.5 || shifted > 300) continue
    const r = totalCost / shifted
    if (r >= 0.9 && r <= 3.0) {
      return {
        ...result,
        liters:            parseFloat(shifted.toFixed(2)),
        litersConf:        (result.litersConf ?? 0.5) * 0.70,
        pricePerLiter:     parseFloat(r.toFixed(3)),
        pricePerLiterConf: 0.72,
      }
    }
  }

  return result
}
