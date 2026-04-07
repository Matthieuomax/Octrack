/**
 * Octrack — Gemini Vision OCR Route
 * Edge function : envoie la photo à Gemini 1.5 Flash et retourne les données extraites.
 *
 * Variables d'environnement requises :
 *   GEMINI_API_KEY — clé API Google AI Studio (https://aistudio.google.com/app/apikey)
 *
 * Format de requête  : POST, JSON { imageBase64: string, mimeType?: string }
 * Format de réponse  : JSON { total: number|null, volume: number|null, pricePerLiter: number|null }
 *
 * Codes d'erreur retournés :
 *   400 — imageBase64 manquant
 *   429 — quota Gemini dépassé (retryAfter indique quand réessayer)
 *   500 — clé API manquante ou erreur interne
 *   502 — erreur API Gemini (autre que quota)
 *   503 — Gemini indisponible / timeout
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

// ─── Prompt système ───────────────────────────────────────────────────────────
//
// Règles strictes pour éviter les hallucinations sur les afficheurs 7-segments :
//   - Jamais de devinette → null si incertain
//   - Plages physiquement réalistes imposées
//   - Réponse JSON pure (pas de markdown, pas de texte autour)

const SYSTEM_PROMPT = `Tu es un extracteur de données spécialisé dans les pompes à carburant françaises.
Analyse l'image et extrais exactement trois valeurs :
  - total        : montant total en euros (ex: 81.65)
  - volume       : litres distribués (ex: 46.42)
  - pricePerLiter: prix par litre (ex: 1.759)

Contraintes physiques absolues (si hors de ces plages → null) :
  - volume       : entre 1 et 300 L
  - total        : entre 1 et 500 €
  - pricePerLiter: entre 0.90 et 3.00 €/L

RÈGLE CRITIQUE : si tu n'es pas certain à 90% d'une valeur, retourne null.
Ne devine JAMAIS. Les chiffres 7-segments peuvent être flous — doute = null.

Réponds UNIQUEMENT avec ce JSON, rien d'autre :
{"total": number|null, "volume": number|null, "pricePerLiter": number|null}`

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Réponse vide normalisée — permet au client de gérer gracieusement les nulls. */
const EMPTY_RESULT = { total: null, volume: null, pricePerLiter: null }

/**
 * Extrait le délai "Retry-After" de la réponse Gemini (en secondes).
 * Gemini peut retourner un header Retry-After ou un body avec retryDelay.
 */
function parseRetryAfter(headers: Headers, bodyText: string): number {
  // 1. Header standard HTTP
  const headerVal = headers.get('Retry-After') ?? headers.get('retry-after')
  if (headerVal) {
    const secs = parseInt(headerVal, 10)
    if (!isNaN(secs) && secs > 0) return secs
  }

  // 2. Body JSON Google AI → error.details[].retryDelay ("30s")
  try {
    const body = JSON.parse(bodyText)
    const details: Array<{ retryDelay?: string }> = body?.error?.details ?? []
    for (const d of details) {
      if (d.retryDelay) {
        const secs = parseInt(d.retryDelay, 10)
        if (!isNaN(secs) && secs > 0) return secs
      }
    }
  } catch { /* body non-JSON, on ignore */ }

  return 60 // fallback : 60 secondes
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await req.json() as {
      imageBase64: string
      mimeType?: string
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('[OCR route] GEMINI_API_KEY manquante')
      return NextResponse.json(
        { error: 'GEMINI_API_KEY non configurée', ...EMPTY_RESULT },
        { status: 500 },
      )
    }

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'imageBase64 manquant', ...EMPTY_RESULT },
        { status: 400 },
      )
    }

    // Nettoyer le préfixe data URL si présent
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '')

    // ── Appel Gemini 1.5 Flash ─────────────────────────────────────────────
    let geminiRes: Response
    try {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: SYSTEM_PROMPT }],
            },
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Data,
                    },
                  },
                  {
                    text: 'Extrais les données de la pompe.',
                  },
                ],
              },
            ],
            generationConfig: {
              temperature:      0,       // déterministe — critique pour les chiffres
              topK:             1,
              maxOutputTokens:  128,
              responseMimeType: 'application/json',
            },
          }),
          signal: AbortSignal.timeout(30_000), // 30 s — edge functions peuvent prendre plus
        },
      )
    } catch (fetchErr) {
      // Timeout réseau ou DNS failure
      const isTimeout = fetchErr instanceof DOMException && fetchErr.name === 'TimeoutError'
      console.error(`[OCR route] ${isTimeout ? 'Timeout' : 'Réseau'} Gemini:`, fetchErr)
      return NextResponse.json(
        {
          error:   isTimeout ? 'Gemini timeout (>30s)' : 'Impossible de joindre Gemini',
          offline: true,
          ...EMPTY_RESULT,
        },
        { status: 503 },
      )
    }

    // ── Gestion des erreurs HTTP Gemini ────────────────────────────────────
    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '')

      // 429 — Quota / Rate Limit
      if (geminiRes.status === 429) {
        const retryAfter = parseRetryAfter(geminiRes.headers, errBody)
        console.warn(`[OCR route] Quota Gemini — retry in ${retryAfter}s`)
        return NextResponse.json(
          {
            error:        'quota_exceeded',
            message:      'Quota Gemini dépassé — réessaie dans quelques secondes.',
            retryAfter,   // en secondes — le client peut afficher un compte à rebours
            ...EMPTY_RESULT,
          },
          {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) },
          },
        )
      }

      // 400 — Image corrompue ou payload invalide
      if (geminiRes.status === 400) {
        console.warn('[OCR route] Gemini 400 — image invalide ou payload mal formé:', errBody)
        return NextResponse.json(
          { error: 'image_invalid', message: 'Image non reconnue par Gemini.', ...EMPTY_RESULT },
          { status: 400 },
        )
      }

      // 401 / 403 — Clé API invalide ou révoquée
      if (geminiRes.status === 401 || geminiRes.status === 403) {
        console.error(`[OCR route] Gemini ${geminiRes.status} — clé API invalide ou révoquée`)
        return NextResponse.json(
          { error: 'api_key_invalid', message: 'Clé API Gemini invalide.', ...EMPTY_RESULT },
          { status: 500 }, // on expose 500 (ne pas leak le 403 au client)
        )
      }

      // 5xx / autre
      console.error(`[OCR route] Gemini ${geminiRes.status}:`, errBody)
      return NextResponse.json(
        { error: `gemini_error_${geminiRes.status}`, message: `Erreur Gemini (${geminiRes.status}).`, ...EMPTY_RESULT },
        { status: 502 },
      )
    }

    // ── Parse de la réponse Gemini ─────────────────────────────────────────
    const geminiData = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }

    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'

    // ── Parse JSON — robuste aux wrappers markdown ─────────────────────────
    let parsed: { total?: unknown; volume?: unknown; pricePerLiter?: unknown } = {}
    try {
      // Gemini peut parfois envelopper dans ```json...```
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim()
      parsed = JSON.parse(cleaned)
    } catch {
      console.warn('[OCR route] Parse JSON échoué — rawText:', rawText)
      // On retourne les nulls proprement plutôt que de crasher
      return NextResponse.json(EMPTY_RESULT)
    }

    // ── Validation des plages physiques ────────────────────────────────────
    const safeNum = (v: unknown, min: number, max: number): number | null => {
      if (typeof v !== 'number' || isNaN(v)) return null
      return v >= min && v <= max ? v : null
    }

    const result = {
      total:         safeNum(parsed.total,         1,    500),
      volume:        safeNum(parsed.volume,         1,    300),
      pricePerLiter: safeNum(parsed.pricePerLiter,  0.90, 3.00),
    }

    return NextResponse.json(result)

  } catch (err) {
    console.error('[OCR route] Erreur inattendue:', err)
    return NextResponse.json(
      { error: 'internal_error', message: 'Erreur interne du serveur.', ...EMPTY_RESULT },
      { status: 500 },
    )
  }
}
