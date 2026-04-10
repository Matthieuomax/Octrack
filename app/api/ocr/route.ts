/**
 * Octrack — Gemini Vision OCR Route
 *
 * ── VARIABLES D'ENVIRONNEMENT VERCEL REQUISES ────────────────────────────────
 *   Vercel Dashboard → ton projet → Settings → Environment Variables
 *   ┌─────────────────────┬──────────────────────────────────────────────────┐
 *   │ KEY                 │ VALUE                                            │
 *   ├─────────────────────┼──────────────────────────────────────────────────┤
 *   │ GEMINI_API_KEY      │ AIzaSy...  (Google AI Studio > Get API Key)      │
 *   └─────────────────────┴──────────────────────────────────────────────────┘
 *   Après ajout → Redeploy obligatoire (ou push git).
 *
 * ── PRINCIPE DE RÉPONSE ──────────────────────────────────────────────────────
 *   Cette route retourne TOUJOURS HTTP 200 au client (sauf 429 quota).
 *   Les erreurs Gemini sont encodées dans le body JSON :
 *     { error: 'code', message: 'texte lisible', geminiRaw: {...} }
 *   Ainsi le client ne croit JAMAIS être "hors-ligne" à cause d'une erreur API.
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

// ─── Prompt ───────────────────────────────────────────────────────────────────
//
// Design :
//   • Instructions dans le 1er message "user" — plus compatible que system_instruction
//     sur toutes les versions de gemini-2.0-flash déployées
//   • Exemples concrets — ancre le format de sortie
//   • "null" explicitement mentionné — évite les hallucinations

const OCR_PROMPT = `Tu es un expert en lecture d'afficheurs numériques 7 segments de pompes à carburant françaises.

MISSION : extraire exactement ces valeurs depuis la photo fournie.
- total         : prix total payé en euros  (plage valide : 1 à 500)
- volume        : litres distribués          (plage valide : 1 à 300)
- pricePerLiter : prix par litre en €/L      (plage valide : 0.90 à 3.00)

RÈGLES ABSOLUES :
1. Lis UNIQUEMENT les chiffres visibles sur l'écran de la pompe.
2. Ne devine JAMAIS — si incertain à moins de 90% → null.
3. Les afficheurs 7 segments peuvent être flous ou partiels : doute = null.
4. Réponds UNIQUEMENT avec le JSON ci-dessous. Zéro texte avant ou après.

Format de réponse (JSON strict) :
{"total": 81.65, "volume": 46.42, "pricePerLiter": 1.759}
{"total": 55.00, "volume": 36.67, "pricePerLiter": null}
{"total": null,  "volume": null,  "pricePerLiter": null}

Extrais les données de la pompe sur cette photo.`

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY = { total: null, volume: null, pricePerLiter: null }

/** Valide qu'une valeur est un nombre dans une plage physique. */
const safeNum = (v: unknown, min: number, max: number): number | null => {
  if (typeof v !== 'number' || isNaN(v) || !isFinite(v)) return null
  return v >= min && v <= max ? v : null
}

function parseRetryAfter(headers: Headers, bodyText: string): number {
  const h = headers.get('Retry-After') ?? headers.get('retry-after')
  if (h) { const n = parseInt(h, 10); if (!isNaN(n) && n > 0) return n }
  try {
    const body    = JSON.parse(bodyText)
    const details = (body?.error?.details ?? []) as Array<{ retryDelay?: string }>
    for (const d of details) {
      if (d.retryDelay) { const n = parseInt(d.retryDelay, 10); if (!isNaN(n) && n > 0) return n }
    }
  } catch { /* body non-JSON */ }
  return 60
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Lecture du body ───────────────────────────────────────────────────────
  let imageBase64: string
  let mimeType = 'image/jpeg'

  try {
    const body = await req.json() as { imageBase64?: string; mimeType?: string }
    if (!body?.imageBase64) {
      return NextResponse.json({ error: 'missing_body', message: 'imageBase64 manquant.', ...EMPTY })
    }
    // Strip du préfixe "data:image/jpeg;base64," si présent
    imageBase64 = body.imageBase64.replace(/^data:[^;]+;base64,/, '')
    if (body.mimeType) mimeType = body.mimeType
  } catch {
    return NextResponse.json({ error: 'invalid_json', message: 'Body JSON invalide.', ...EMPTY })
  }

  // ── Clé API ───────────────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    const msg = 'GEMINI_API_KEY absente — configurer dans Vercel > Settings > Environment Variables puis Redeploy.'
    console.error(`[OCR] ❌ ${msg}`)
    return NextResponse.json({ error: 'no_api_key', message: msg, ...EMPTY })
  }

  // ── Appel Gemini 1.5 Flash ────────────────────────────────────────────────
  //
  // Notes de format :
  //   • Le prompt est dans "contents[0].parts" (pas system_instruction top-level)
  //     — plus compatible avec toutes les versions déployées
  //   • safetySettings BLOCK_NONE — Gemini peut bloquer des photos de pompes
  //     si logos ou reflets déclenchent les filtres DANGEROUS_CONTENT
  //   • Pas de responseMimeType — champ instable, on parse le texte brut
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          // Format REST API snake_case "inline_data" (≠ SDK camelCase "inlineData")
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: OCR_PROMPT },
        ],
      },
    ],
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
    generationConfig: {
      temperature:     0,    // déterministe — obligatoire pour les chiffres
      topK:            1,
      maxOutputTokens: 256,
    },
  }

  let geminiRes: Response
  try {
    geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(requestBody),
        signal:  AbortSignal.timeout(20_000),
      },
    )
  } catch (fetchErr) {
    const isTimeout = fetchErr instanceof DOMException && fetchErr.name === 'TimeoutError'
    const msg = isTimeout ? 'Timeout — Gemini n\'a pas répondu en 20 secondes.' : 'Impossible de joindre Gemini (réseau).'
    console.error(`[OCR] ${msg}`, fetchErr)
    // offline: true → le client peut activer le mode hors-ligne
    return NextResponse.json({ error: isTimeout ? 'timeout' : 'network_error', message: msg, offline: true, ...EMPTY })
  }

  // ── Traitement des erreurs HTTP Gemini ────────────────────────────────────
  //
  // On lit le body UNE seule fois, puis on adapte la réponse.
  // TOUTES les réponses vers le client sont HTTP 200 pour éviter le faux "offline".
  const errBodyText = geminiRes.ok ? '' : await geminiRes.text().catch(() => '')

  if (!geminiRes.ok) {
    console.error(`[OCR] ❌ Gemini HTTP ${geminiRes.status}\n  Body: ${errBodyText.slice(0, 600)}`)

    if (geminiRes.status === 429) {
      const retryAfter = parseRetryAfter(geminiRes.headers, errBodyText)
      // 429 garde un statut spécial pour que le client sache attendre
      return NextResponse.json(
        { error: 'quota_exceeded', message: 'Quota Gemini dépassé — réessaie dans quelques secondes.', retryAfter, ...EMPTY },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      )
    }

    if (geminiRes.status === 400) {
      let detail = errBodyText.slice(0, 300)
      try { detail = JSON.parse(errBodyText)?.error?.message ?? detail } catch { /* ignore */ }
      console.error(`[OCR] 400 Gemini — détail : ${detail}`)
      // HTTP 200 vers le client — encode l'erreur dans le body
      return NextResponse.json({
        error:      'gemini_400',
        message:    `Format de requête rejeté par Gemini : ${detail}`,
        geminiRaw:  errBodyText.slice(0, 400),
        ...EMPTY,
      })
    }

    if (geminiRes.status === 401 || geminiRes.status === 403) {
      const msg = 'Clé API Gemini invalide ou révoquée — vérifier GEMINI_API_KEY dans Vercel.'
      console.error(`[OCR] ${msg}`)
      return NextResponse.json({ error: 'api_key_invalid', message: msg, ...EMPTY })
    }

    return NextResponse.json({
      error:     `gemini_${geminiRes.status}`,
      message:   `Erreur Gemini ${geminiRes.status}.`,
      geminiRaw: errBodyText.slice(0, 400),
      ...EMPTY,
    })
  }

  // ── Parse réponse Gemini ──────────────────────────────────────────────────
  let rawText = ''
  try {
    const data = await geminiRes.json() as {
      candidates?: Array<{
        content?:      { parts?: Array<{ text?: string }> }
        finishReason?: string
        safetyRatings?: Array<{ category: string; probability: string; blocked?: boolean }>
      }>
      promptFeedback?: {
        blockReason?:   string
        safetyRatings?: Array<{ category: string; probability: string }>
      }
      error?: { code?: number; message?: string; status?: string }
    }

    // Erreur structurée Google dans un body HTTP 200 (ça arrive)
    if (data.error) {
      const msg = data.error.message ?? JSON.stringify(data.error)
      console.error('[OCR] Erreur Google dans body 200 :', msg)
      return NextResponse.json({
        error:     'google_error',
        message:   `Gemini a retourné une erreur : ${msg}`,
        geminiRaw: data.error,
        ...EMPTY,
      })
    }

    // Safety block au niveau du prompt (image elle-même bloquée)
    if (data.promptFeedback?.blockReason) {
      const reason = data.promptFeedback.blockReason
      const ratings = JSON.stringify(data.promptFeedback.safetyRatings ?? [])
      console.error(`[OCR] 🚫 Safety block prompt — raison: ${reason} — ratings: ${ratings}`)
      return NextResponse.json({
        error:     'safety_block',
        message:   `Bloqué par les filtres de sécurité Google (${reason})`,
        geminiRaw: { blockReason: reason, safetyRatings: data.promptFeedback.safetyRatings },
        ...EMPTY,
      })
    }

    const candidate    = data.candidates?.[0]
    const finishReason = candidate?.finishReason ?? ''

    // Safety block au niveau du candidat
    if (finishReason === 'SAFETY') {
      const blocked = (candidate?.safetyRatings ?? []).filter(r => r.blocked || r.probability !== 'NEGLIGIBLE')
      console.error('[OCR] 🚫 Safety block candidat :', JSON.stringify(blocked))
      return NextResponse.json({
        error:     'safety_block',
        message:   `Bloqué par les filtres de sécurité Google — catégories: ${blocked.map(r => r.category).join(', ')}`,
        geminiRaw: { finishReason, blocked },
        ...EMPTY,
      })
    }

    // Texte vide (MAX_TOKENS, OTHER, RECITATION…)
    rawText = candidate?.content?.parts?.[0]?.text ?? ''
    if (!rawText) {
      const fullResp = JSON.stringify(data).slice(0, 500)
      console.warn(`[OCR] Texte vide — finishReason: ${finishReason} — réponse: ${fullResp}`)
      return NextResponse.json({
        error:     'empty_response',
        message:   `Gemini n'a rien retourné (finishReason: ${finishReason || 'inconnu'})`,
        geminiRaw: { finishReason },
        ...EMPTY,
      })
    }

    console.info('[OCR] Réponse Gemini brute:', rawText.slice(0, 200))

  } catch (parseErr) {
    console.error('[OCR] Parse réponse Gemini échoué:', parseErr)
    return NextResponse.json({ error: 'parse_error', message: 'Réponse Gemini illisible.', ...EMPTY })
  }

  // ── Nettoyage et extraction JSON ──────────────────────────────────────────
  const cleaned   = rawText.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*?\}/)

  if (!jsonMatch) {
    console.warn('[OCR] Aucun JSON dans:', cleaned.slice(0, 200))
    return NextResponse.json({ error: 'no_json', message: `Gemini n'a pas retourné de JSON : ${cleaned.slice(0, 100)}`, ...EMPTY })
  }

  let parsed: { total?: unknown; volume?: unknown; pricePerLiter?: unknown } = {}
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (e) {
    console.warn('[OCR] JSON malformé:', jsonMatch[0].slice(0, 200), e)
    return NextResponse.json({ error: 'malformed_json', message: 'JSON Gemini malformé.', ...EMPTY })
  }

  // ── Validation des plages physiques ───────────────────────────────────────
  const result = {
    total:         safeNum(parsed.total,         1,    500),
    volume:        safeNum(parsed.volume,         1,    300),
    pricePerLiter: safeNum(parsed.pricePerLiter,  0.90, 3.00),
  }

  console.info(`[OCR] ✅ total=${result.total} € | volume=${result.volume} L | ppl=${result.pricePerLiter} €/L`)
  return NextResponse.json(result)
}
