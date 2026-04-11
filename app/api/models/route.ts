/**
 * Octrack — Endpoint de diagnostic Gemini
 *
 * Visite https://ton-app.vercel.app/api/models pour voir
 * la liste exacte des modèles disponibles pour ta clé API.
 *
 * À SUPPRIMER une fois le bon modèle identifié.
 */

import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY manquante dans Vercel env vars' }, { status: 500 })
  }

  // Appel ListModels — retourne tous les modèles disponibles pour cette clé
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=50`,
    { signal: AbortSignal.timeout(10_000) },
  ).catch((err) => { throw new Error(`Réseau: ${err.message}`) })

  const body = await res.json()

  if (!res.ok) {
    return NextResponse.json({
      error:      'ListModels a échoué',
      httpStatus: res.status,
      detail:     body,
    }, { status: 200 })
  }

  // Filtrer les modèles qui supportent generateContent + multimodal (images)
  const allModels = (body.models ?? []) as Array<{
    name: string
    displayName: string
    supportedGenerationMethods?: string[]
    description?: string
  }>

  const visionModels = allModels.filter(m =>
    m.supportedGenerationMethods?.includes('generateContent'),
  )

  return NextResponse.json({
    keyPrefix:    apiKey.slice(0, 12) + '...',
    totalModels:  allModels.length,
    generateContentModels: visionModels.map(m => ({
      id:          m.name.replace('models/', ''),
      displayName: m.displayName,
    })),
    allModelNames: allModels.map(m => m.name.replace('models/', '')),
  })
}
