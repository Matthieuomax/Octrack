#!/usr/bin/env node
/**
 * Octrack — Générateur d'icônes PWA
 * Thème "Cadran d'Octane" : tachymètre de précision, palette Bitume/Octane
 * Usage : node scripts/generate-icons.mjs
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const publicDir  = join(__dirname, '..', 'public')
if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true })

/* ── Helpers géométriques ──────────────────────────────────────────────────── */
const D2R = Math.PI / 180
const CX = 256, CY = 256
const pt  = (deg, r) => [CX + r * Math.cos(deg * D2R), CY + r * Math.sin(deg * D2R)]
const f   = n => Number(n).toFixed(2)

/** Arc SVG clockwise de fromDeg à toDeg sur le rayon r */
function arc(fromDeg, toDeg, r) {
  const [x1, y1] = pt(fromDeg, r)
  const [x2, y2] = pt(toDeg,   r)
  const diff = ((toDeg - fromDeg) + 360) % 360 || 360
  return `M${f(x1)},${f(y1)} A${r},${r},0,${diff > 180 ? 1 : 0},1,${f(x2)},${f(y2)}`
}

/* ── Paramètres du design ──────────────────────────────────────────────────── */
const GR  = 175    // Rayon centerline de l'arc de jauge
const GS  = 22     // Épaisseur du trait de jauge
const S   = 150    // Début : 8h (150°)
const E   = 30     // Fin   : 4h (30°) → 240° horaire total
const PCT = 0.72   // 72 % rempli — lecture "moteur chaud"
const F   = S + PCT * 240   // = 322.8°

// Gradient de l'arc actif (userSpace) : du point de départ vers le point d'arrivée
const [gx1, gy1] = pt(S, GR)   // ~ (104, 343)
const [gx2, gy2] = pt(F, GR)   // ~ (395, 150)

// Point de terminaison (indicateur vert)
const [epx, epy] = pt(F, GR)

// Aiguille
const [ntx, nty] = pt(F,       152)  // pointe
const [nbx, nby] = pt(F + 180,  38)  // queue
// Ailes latérales à hauteur du centre (±8 px perpendiculaires)
const nrx = CX + 8 * Math.cos((F - 90) * D2R)
const nry = CY + 8 * Math.sin((F - 90) * D2R)
const nlx = CX + 8 * Math.cos((F + 90) * D2R)
const nly = CY + 8 * Math.sin((F + 90) * D2R)
const needlePts = `${f(ntx)},${f(nty)} ${f(nrx)},${f(nry)} ${f(nbx)},${f(nby)} ${f(nlx)},${f(nly)}`

/* ── Graduations ───────────────────────────────────────────────────────────── */
const ticks = Array.from({ length: 9 }, (_, i) => {
  const deg   = S + (i / 8) * 240
  const major = i % 2 === 0
  const [x1, y1] = pt(deg, major ? 193 : 188)
  const [x2, y2] = pt(deg, major ? 207 : 199)
  const active = deg <= F
  const col = active
    ? (major ? '#FF6B00' : '#FF8833')
    : (major ? '#3A3A4C' : '#252534')
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${col}" stroke-width="${major ? 3 : 1.5}" stroke-linecap="round"/>`
}).join('\n  ')

/* ── SVG complet ───────────────────────────────────────────────────────────── */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>

  <!-- Fond bitume : gradient radial du centre vers les bords -->
  <radialGradient id="bg" cx="45%" cy="42%" r="58%">
    <stop offset="0%"   stop-color="#1C1C22"/>
    <stop offset="100%" stop-color="#070709"/>
  </radialGradient>

  <!-- Bague extérieure métallique -->
  <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%"   stop-color="#484852"/>
    <stop offset="35%"  stop-color="#26262E"/>
    <stop offset="70%"  stop-color="#36363E"/>
    <stop offset="100%" stop-color="#161620"/>
  </linearGradient>

  <!-- Arc actif : dégradé orange octane → or -->
  <linearGradient id="arcFill" gradientUnits="userSpaceOnUse"
    x1="${f(gx1)}" y1="${f(gy1)}" x2="${f(gx2)}" y2="${f(gy2)}">
    <stop offset="0%"   stop-color="#FF3200"/>
    <stop offset="48%"  stop-color="#FF6B00"/>
    <stop offset="100%" stop-color="#FFD700"/>
  </linearGradient>

  <!-- Halo de l'arc (glow simulé sans filtre) -->
  <linearGradient id="glowGrad" gradientUnits="userSpaceOnUse"
    x1="${f(gx1)}" y1="${f(gy1)}" x2="${f(gx2)}" y2="${f(gy2)}">
    <stop offset="0%"   stop-color="#FF3200" stop-opacity="0.20"/>
    <stop offset="60%"  stop-color="#FF6B00" stop-opacity="0.25"/>
    <stop offset="100%" stop-color="#FFD700" stop-opacity="0.10"/>
  </linearGradient>

  <!-- Aiguille : gradient queue → pointe -->
  <linearGradient id="needleGrad" gradientUnits="userSpaceOnUse"
    x1="${f(nbx)}" y1="${f(nby)}" x2="${f(ntx)}" y2="${f(nty)}">
    <stop offset="0%"   stop-color="#CC3000"/>
    <stop offset="100%" stop-color="#FFE200"/>
  </linearGradient>

  <!-- Moyeu central -->
  <radialGradient id="hubGrad" cx="36%" cy="32%" r="68%">
    <stop offset="0%"   stop-color="#3E3E48"/>
    <stop offset="100%" stop-color="#0C0C12"/>
  </radialGradient>

  <!-- Indicateur vert (glow) -->
  <radialGradient id="epGlow" cx="50%" cy="50%" r="50%">
    <stop offset="0%"   stop-color="#00E676" stop-opacity="0.50"/>
    <stop offset="100%" stop-color="#00E676" stop-opacity="0"/>
  </radialGradient>

</defs>

<!-- ① Fond arrondi bitume -->
<rect x="0" y="0" width="512" height="512" rx="108" ry="108" fill="url(#bg)"/>
<!-- Voile légèrement clair pour éviter le noir total -->
<rect x="0" y="0" width="512" height="512" rx="108" ry="108" fill="white" opacity="0.013"/>

<!-- ② Bague externe métallique (3 anneaux) -->
<circle cx="256" cy="256" r="241" fill="none" stroke="url(#ring)" stroke-width="3.5"/>
<circle cx="256" cy="256" r="238" fill="none" stroke="white"     stroke-width="0.9" opacity="0.07"/>
<circle cx="256" cy="256" r="235" fill="none" stroke="#080810"   stroke-width="1.5" opacity="0.65"/>

<!-- ③ Piste de la jauge (arc sombre, 240°) -->
<path d="${arc(S, E, GR)}"
  fill="none" stroke="#111119" stroke-width="${GS + 5}" stroke-linecap="butt"/>
<path d="${arc(S, E, GR)}"
  fill="none" stroke="#18182200" stroke-width="${GS}" stroke-linecap="butt"/>
<path d="${arc(S, E, GR)}"
  fill="none" stroke="#1A1A26" stroke-width="${GS}" stroke-linecap="butt"/>
<!-- Reflet interne de la piste -->
<path d="${arc(S, E, GR - 8)}"
  fill="none" stroke="white" stroke-width="0.5" stroke-linecap="butt" opacity="0.033"/>

<!-- ④ Halo de l'arc actif (3 couches de plus en plus larges) -->
<path d="${arc(S, F, GR)}"
  fill="none" stroke="url(#glowGrad)" stroke-width="${GS + 32}" stroke-linecap="round"/>
<path d="${arc(S, F, GR)}"
  fill="none" stroke="url(#glowGrad)" stroke-width="${GS + 18}" stroke-linecap="round"/>
<path d="${arc(S, F, GR)}"
  fill="none" stroke="url(#glowGrad)" stroke-width="${GS + 8}"  stroke-linecap="round"/>

<!-- ⑤ Arc actif (orange → or) -->
<path d="${arc(S, F, GR)}"
  fill="none" stroke="url(#arcFill)" stroke-width="${GS}" stroke-linecap="round"/>
<!-- Reflet brillant sur l'arc (liseré blanc) -->
<path d="${arc(S, F, GR - 7)}"
  fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" opacity="0.17"/>

<!-- ⑥ Graduations -->
${ticks}

<!-- ⑦ Indicateur de point de données (vert / glow) -->
<circle cx="${f(epx)}" cy="${f(epy)}" r="30" fill="url(#epGlow)"/>
<circle cx="${f(epx)}" cy="${f(epy)}" r="20" fill="url(#epGlow)"/>
<circle cx="${f(epx)}" cy="${f(epy)}" r="12" fill="#00E676" opacity="0.85"/>
<circle cx="${f(epx)}" cy="${f(epy)}" r="7"  fill="#80FFB9"/>
<circle cx="${f(epx)}" cy="${f(epy)}" r="3"  fill="white"   opacity="0.95"/>

<!-- ⑧ Ombre de l'aiguille (décalée) -->
<polygon points="${needlePts}" fill="url(#needleGrad)" opacity="0.22" transform="translate(2,4)"/>
<!-- Corps de l'aiguille -->
<polygon points="${needlePts}" fill="url(#needleGrad)"/>
<!-- Liseré blanc fin -->
<polygon points="${needlePts}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="0.9"/>

<!-- ⑨ Moyeu central -->
<circle cx="256" cy="256" r="30" fill="url(#hubGrad)" stroke="#3C3C46" stroke-width="1.8"/>
<circle cx="256" cy="256" r="26" fill="none" stroke="white" stroke-width="0.7" opacity="0.10"/>
<circle cx="256" cy="256" r="17" fill="#0C0C14" stroke="#2A2A34" stroke-width="1"/>
<!-- Vis centrale (croix) -->
<line x1="243" y1="256" x2="269" y2="256" stroke="#3A3A4A" stroke-width="2.2" stroke-linecap="round"/>
<line x1="256" y1="243" x2="256" y2="269" stroke="#3A3A4A" stroke-width="2.2" stroke-linecap="round"/>
<!-- Reflet central -->
<circle cx="251" cy="251" r="3" fill="white" opacity="0.14"/>

<!-- ⑩ Reflet vitré (haut-gauche) -->
<ellipse cx="196" cy="170" rx="86" ry="50"
  fill="white" opacity="0.038" transform="rotate(-28,196,170)"/>
<ellipse cx="190" cy="162" rx="55" ry="30"
  fill="white" opacity="0.048" transform="rotate(-28,190,162)"/>

</svg>`

/* ── Sauvegarde SVG source ─────────────────────────────────────────────────── */
writeFileSync(join(publicDir, 'icon.svg'), svg, 'utf8')
console.log('✓ public/icon.svg')

/* ── Conversion PNG via sharp ─────────────────────────────────────────────── */
// Sharp est fourni par Next.js — on le résout depuis son emplacement bundlé.
let sharp
try {
  const req = createRequire(import.meta.url)
  // 1. Essai via require standard (si installé en devDependencies)
  try { sharp = req('sharp') } catch { /* pas installé globalement */ }
  // 2. Fallback : sharp bundlé dans Next.js
  if (!sharp) {
    const nextSharpPath = join(__dirname, '..', 'node_modules', 'next', 'node_modules', 'sharp', 'lib', 'index.js')
    if (existsSync(nextSharpPath)) {
      sharp = req(nextSharpPath)
    }
  }
  if (!sharp) throw new Error('introuvable')
} catch {
  console.error('\n⚠  sharp introuvable — installe-le : npm install --save-dev sharp')
  console.log('   Le SVG source est disponible dans public/icon.svg')
  process.exit(0)
}

const buf = Buffer.from(svg, 'utf8')
const sizes = [
  { name: 'icon-512.png',          size: 512 },
  { name: 'icon-192.png',          size: 192 },
  { name: 'apple-touch-icon.png',  size: 180 },
]

for (const { name, size } of sizes) {
  await sharp(buf, { density: Math.round((size / 512) * 192) })
    .resize(size, size)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(join(publicDir, name))
  console.log(`✓ public/${name} (${size}×${size})`)
}

console.log('\n✅ Icônes PWA générées avec succès !')
