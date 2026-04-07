/**
 * Octrack — Gemini Vision OCR Route
 * Edge function : envoie la photo à Gemini 1.5 Flash et retourne les données extraites.
 *
 * Variables d'environnement requises :
 *   GEMINI_API_KEY — clé API Google AI Studio (https://aistudio.google.com/app/apikey)
 *
 * Format de requête  : POST, JSON { imageBase64: string, mimeType?: string }
 * Format de réponse  : JSON { total: number|null, volume: number|null, pricePerLiter: number|null }
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
        { error: 'GEMINI_API_KEY non configurée', total: null, volume: null, pricePerLiter: null },
        { status: 500 },
      )
    }

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'imageBase64 manquant', total: null, volume: null, pricePerLiter: null },
        { status: 400 },
      )
    }

    // Nettoyer le préfixe data URL si présent
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '')

    // ── Appel Gemini 1.5 Flash ─────────────────────────────────────────────
    const geminiRes = await fetch(
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
      },
    )

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '(no body)')
      console.error(`[OCR route] Gemini ${geminiRes.status}:`, errBody)
      return NextResponse.json(
        { error: `Gemini API error ${geminiRes.status}`, total: null, volume: null, pricePerLiter: null },
        { status: 502 },
      )
    }

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
      console.warn('[OCR route] Parse JSON échoué:', rawText)
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
      { error: 'Erreur interne', total: null, volume: null, pricePerLiter: null },
      { status: 500 },
    )
  }
}
