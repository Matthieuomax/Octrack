import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // ── Optimisations production ──────────────────────────────────────────────
  // Compresse automatiquement les réponses (gzip/br) — déjà actif sur Vercel,
  // utile pour le dev local et les prévisualisations.
  compress: true,

  // ── En-têtes de sécurité ──────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Empêche le sniffing de MIME type
          { key: 'X-Content-Type-Options',   value: 'nosniff' },
          // Interdit l'iframe (clickjacking)
          { key: 'X-Frame-Options',          value: 'DENY' },
          // Force HTTPS (1 an)
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Désactive les referrer vers des domaines tiers
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          // Permissions browser — désactive ce dont Octrack n'a pas besoin
          { key: 'Permissions-Policy',        value: 'geolocation=(self), camera=(self), microphone=()' },
        ],
      },
      // Note : le cache des assets /_next/static/ est géré automatiquement
      // par Next.js et Vercel — pas besoin de l'overrider ici.
    ]
  },
}

export default nextConfig
