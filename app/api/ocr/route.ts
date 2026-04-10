/**
 * Octrack — Gemini Vision OCR Route
 *
 * ── VARIABLES D'ENVIRONNEMENT VERCEL REQUISES ────────────────────────────────
 *
 *   Vercel Dashboard → ton projet → Settings → Environment Variables
 *   ┌─────────────────────┬──────────────────────────────────────────────────┐
 *   │ KEY                 │ VALUE                                            │
 *   ├─────────────────────┼──────────────────────────────────────────────────┤
 *   │ GEMINI_API_KEY      │ AIzaSy...  (Google AI Studio > Get API Key)      │
 *   └─────────────────────┴──────────────────────────────────────────────────┘
 *
 *   ⚠️  Après ajout : redéployer (Vercel > Deployments > Redeploy) ou push git.
 *   ⚠️  La variable doit être activée pour "Production" ET "Preview".
 *
 * ── FORMAT REQUÊTE ───────────────────────────────────────────────────────────
 *   POST { imageBase64: string, mimeType?: string }
 *   imageBase64 DOIT être compressé côté client à < 900 KB (lib/geminiOcr.ts)
 *   → Vercel Edge limit = 4.5 MB body ; photo brute smartphone = 3-8 MB
 *
 * ── FORMAT RÉPONSE ───────────────────────────────────────────────────────────
 *   200 { total: number|null, volume: number|null, pricePerLiter: number|null }
 *   400 { error: 'image_invalid' | 'missing_body' }
 *   429 { error: 'quota_exceeded', retryAfter: number }
 *   500 { error: 'no_api_key' | 'api_key_invalid' | 'internal_error' }
 *   502 { error: 'gemini_error_NNN' }
 *   503 { error: 'timeout' | 'network_error', offline: true }
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

// ─── Prompt Gemini ────────────────────────────────────────────────────────────
//
// Règles de design du prompt :
//   1. Court et autoritaire — Gemini suit mieux un ordre simple qu'une liste de règles
//   2. Exemples concrets — ancre le modèle sur le format de sortie attendu
//   3. "null" explicitement — évite les hallucinations de valeurs inventées
//   4. Pas de "responseMimeType" — ce champ est instable sur certaines versions Flash ;
//      on nettoie le texte brut côté serveur (plus robuste)

const SYSTEM_PROMPT = `Tu es un expert en lecture d'afficheurs numériques 7 segments de pompes à carburant.
On te donne une photo d'une pompe à essence ou diesel prise en France.

Ton unique mission : extraire le prix total payé et le volume de carburant distribué.

RÈGLES STRICTES :
- Lis UNIQUEMENT les chiffres visibles sur l'écran de la pompe.
- Ne devine JAMAIS. Si un chiffre est flou ou absent → null.
- total   : euros payés    → plage valide 1 à 500 €
- volume  : litres pompés  → plage valide 1 à 300 L
- pricePerLiter : €/L      → plage valide 0.90 à 3.00 (optionnel)

Exemples de réponses correctes :
{"total": 81.65, "volume": 46.42, "pricePerLiter": 1.759}
{"total": 55.00, "volume": 36.67, "pricePerLiter": null}
{"total": null,  "volume": null,  "pricePerLiter": null}

Réponds UNIQUEMENT avec le JSON. Zéro texte avant ou après. Zéro markdown.`

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY = { total: null, volume: null, pricePerLiter: null }

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

/** Valide qu'une valeur est un nombre dans une plage physique. */
const safeNum = (v: unknown, min: number, max: number): number | null => {
  if (typeof v !== 'number' || isNaN(v) || !isFinite(v)) return null
  return v >= min && v <= max ? v : null
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Lecture du body ───────────────────────────────────────────────────────
  let imageBase64: string
  let mimeType = 'image/jpeg'

  try {
    const body = await req.json() as { imageBase64?: string; mimeType?: string }
    if (!body?.imageBase64) {
      return NextResponse.json({ error: 'missing_body', ...EMPTY }, { status: 400 })
    }
    imageBase64 = body.imageBase64.replace(/^data:[^;]+;base64,/, '')
    if (body.mimeType) mimeType = body.mimeType
  } catch {
    return NextResponse.json({ error: 'invalid_json', ...EMPTY }, { status: 400 })
  }

  // ── Vérification clé API ──────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error(
      '[OCR] ❌ GEMINI_API_KEY manquante.\n' +
      '  → Vercel Dashboard > Settings > Environment Variables\n' +
      '  → Ajouter : GEMINI_API_KEY = AIzaSy... puis Redeploy.',
    )
    return NextResponse.json({ error: 'no_api_key', ...EMPTY }, { status: 500 })
  }

  // ── Appel Gemini 1.5 Flash ────────────────────────────────────────────────
  // NOTE : pas de `responseMimeType` dans generationConfig — ce champ est instable
  // selon la version Flash déployée. On nettoie le texte brut côté serveur.
  //
  // safetySettings : BLOCK_NONE sur toutes les catégories.
  // Gemini peut bloquer des photos de pompes à cause d'un reflet ou d'un logo
  // interprété comme "dangerous content". Ce comportement est documenté.
  const requestBody = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        parts: [
          // Format REST API : snake_case "inline_data" (≠ SDK JS "inlineData")
          // Le préfixe "data:image/jpeg;base64," est DÉJÀ supprimé avant cet appel.
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: 'Extrais les données de la pompe.' },
        ],
      },
    ],
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_NONE' },
    ],
    generationConfig: {
      temperature:     0,    // déterministe — obligatoire pour les chiffres
      topK:            1,
      maxOutputTokens: 256,  // assez pour le JSON + éventuel padding Gemini
    },
  }

  let geminiRes: Response
  try {
    geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(requestBody),
        signal:  AbortSignal.timeout(20_000), // Vercel Edge Hobby = 25 s max → on laisse 5 s de marge
      },
    )
  } catch (fetchErr) {
    const isTimeout = fetchErr instanceof DOMException && fetchErr.name === 'TimeoutError'
    console.error(`[OCR] ${isTimeout ? '⏱ Timeout Gemini' : '🌐 Réseau Gemini'}:`, fetchErr)
    return NextResponse.json(
      { error: isTimeout ? 'timeout' : 'network_error', offline: true, ...EMPTY },
      { status: 503 },
    )
  }

  // ── Traitement des erreurs HTTP Gemini ────────────────────────────────────
  if (!geminiRes.ok) {
    const errBody = await geminiRes.text().catch(() => '(body illisible)')

    // Log complet — visible dans Vercel Functions logs
    console.error(
      `[OCR] ❌ Gemini HTTP ${geminiRes.status}\n` +
      `  Body : ${errBody.slice(0, 600)}`,
    )

    if (geminiRes.status === 429) {
      const retryAfter = parseRetryAfter(geminiRes.headers, errBody)
      return NextResponse.json(
        { error: 'quota_exceeded', message: 'Quota Gemini dépassé.', retryAfter, ...EMPTY },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      )
    }

    if (geminiRes.status === 400) {
      // 400 peut signifier image corrompue OU payload malformé
      return NextResponse.json(
        { error: 'image_invalid', message: `Gemini 400 — ${errBody.slice(0, 120)}`, ...EMPTY },
        { status: 400 },
      )
    }

    if (geminiRes.status === 401 || geminiRes.status === 403) {
      console.error(
        '[OCR] ❌ Clé API invalide ou révoquée.\n' +
        '  → Vérifier la valeur de GEMINI_API_KEY dans Vercel.\n' +
        '  → La clé doit commencer par "AIza".',
      )
      return NextResponse.json(
        { error: 'api_key_invalid', message: 'Clé API Gemini invalide ou révoquée.', ...EMPTY },
        { status: 500 },
      )
    }

    return NextResponse.json(
      { error: `gemini_error_${geminiRes.status}`, message: `Erreur Gemini ${geminiRes.status}.`, ...EMPTY },
      { status: 502 },
    )
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
      promptFeedback?: { blockReason?: string; safetyRatings?: Array<{ category: string; probability: string }> }
      // Objet d'erreur complet retourné par Google sur certaines requêtes rejetées
      error?: { code?: number; message?: string; status?: string; details?: unknown[] }
    }

    // ── Erreur Google structurée (parfois retournée avec HTTP 200 !) ─────────
    if (data.error) {
      const msg = data.error.message ?? JSON.stringify(data.error)
      console.error('[OCR] Erreur Google dans le body (HTTP 200) :', msg, data.error)
      return NextResponse.json(
        { error: 'google_error', message: msg, details: data.error, ...EMPTY },
        { status: 502 },
      )
    }

    // ── Safety block au niveau du prompt ─────────────────────────────────────
    if (data.promptFeedback?.blockReason) {
      const reason = data.promptFeedback.blockReason
      console.error(
        `[OCR] 🚫 Bloqué par les filtres de sécurité Google — raison : ${reason}\n` +
        `  safetyRatings : ${JSON.stringify(data.promptFeedback.safetyRatings ?? [])}`,
      )
      return NextResponse.json(
        { error: 'safety_block', message: `Bloqué par les filtres de sécurité Google (${reason})`, ...EMPTY },
        { status: 200 }, // Gemini retourne 200 même sur un Safety block
      )
    }

    // ── Safety block au niveau du candidat (finishReason = SAFETY) ───────────
    const candidate   = data.candidates?.[0]
    const finishReason = candidate?.finishReason ?? ''

    if (finishReason === 'SAFETY') {
      const ratings = candidate?.safetyRatings ?? []
      const blocked = ratings.filter(r => r.blocked || r.probability !== 'NEGLIGIBLE')
      console.error(
        '[OCR] 🚫 Bloqué par les filtres de sécurité Google — candidate finishReason=SAFETY\n' +
        `  Catégories concernées : ${JSON.stringify(blocked)}`,
      )
      return NextResponse.json(
        { error: 'safety_block', message: 'Bloqué par les filtres de sécurité Google (candidate)', ...EMPTY },
        { status: 200 },
      )
    }

    rawText = candidate?.content?.parts?.[0]?.text ?? ''

    if (!rawText) {
      console.warn(`[OCR] Texte vide — finishReason: ${finishReason || 'inconnu'} — réponse complète:`, JSON.stringify(data).slice(0, 400))
      return NextResponse.json(EMPTY)
    }

    console.info('[OCR] Réponse Gemini brute:', rawText.slice(0, 200))

  } catch (parseErr) {
    console.error('[OCR] Impossible de parser la réponse Gemini:', parseErr)
    return NextResponse.json(EMPTY)
  }

  // ── Nettoyage et extraction JSON ──────────────────────────────────────────
  // Gemini retourne parfois ```json ... ``` même sans responseMimeType
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim()

  // Chercher le premier objet JSON dans la réponse (robuste aux préfixes texte)
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.warn('[OCR] Aucun JSON trouvé dans:', cleaned.slice(0, 200))
    return NextResponse.json(EMPTY)
  }

  let parsed: { total?: unknown; volume?: unknown; pricePerLiter?: unknown } = {}
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (jsonErr) {
    console.warn('[OCR] JSON malformé:', jsonMatch[0].slice(0, 200), jsonErr)
    return NextResponse.json(EMPTY)
  }

  // ── Validation des plages physiques ───────────────────────────────────────
  const result = {
    total:         safeNum(parsed.total,         1,    500),
    volume:        safeNum(parsed.volume,         1,    300),
    pricePerLiter: safeNum(parsed.pricePerLiter,  0.90, 3.00),
  }

  console.info(
    `[OCR] ✅ Résultat : total=${result.total} € | volume=${result.volume} L | PPL=${result.pricePerLiter} €/L`,
  )

  return NextResponse.json(result)
}
