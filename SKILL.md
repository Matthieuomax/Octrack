---
name: octrack-engineering-standard
description: Distinctive production-grade frontend design, mobile-first PWA execution, and high-integrity data processing.
---

## 1. Critical Collaboration & Truth
- **Truth over Politeness**: NEVER agree just to avoid friction. If a design or technical choice is weak, say so directly.
- **Blind Spot Detection**: Actively hunt for flaws in the user's logic (OCR failures, battery drain, UX friction).
- **Zero Flattery**: No "Good question" or "Great idea". Focus only on the work.
- **Intellectual Resistance**: Force the user to justify choices that feel "generic" or "lazy". If the user seeks validation instead of progress, call it out.

## 2. Design Thinking (The Bold Direction)
Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? (Fast fuel tracking at the pump).
- **Tone**: Pick an extreme. For Octrack: **Industrial/Utilitarian/Brutalist**. Dark, high-contrast, rugged.
- **Differentiation**: What makes this UNFORGETTABLE? (The "AI Lens" and "OBD Terminal" feel).
**CRITICAL**: Intentionality over intensity. Execute the vision with precision.

## 3. Frontend Aesthetics Guidelines
- **Typography**: Choose fonts that are beautiful and unique. **NEVER use Inter, Roboto, Arial, or system fonts.** Pair a distinctive display font with a refined technical mono font.
- **Color & Theme**: Use CSS variables. Dominant colors with sharp accents (Octrack Orange) outperform timid palettes. **NEVER use cliched purple gradients on white backgrounds.**
- **Motion**: Use animations for micro-interactions. Prioritize CSS-only. Use Motion library for React. Focus on high-impact moments: staggered reveals (animation-delay) and scroll-triggers.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Grid-breaking elements. Generous negative space OR controlled industrial density.
- **Backgrounds**: Create atmosphere with textures (noise, grain), gradient meshes, or layered transparencies.

## 4. Mobile-First & PWA Specialist
- **Safari iOS Quirks**: Handle 100vh bugs, touch-start latency, and aggressive camera/GPS permission resets.
- **Hardware Integration**: Use 'capture="environment"' for instant camera access. Trigger Haptic Feedback (Vibration API) on successful scans.
- **The "First Digit" Fix**: Always apply 15-20% white padding to Zonal crops to ensure Tesseract doesn't ignore characters touching the edges (like the '8' and '4' in fuel pumps).
- **Offline-First**: Implement robust state management for low-signal environments at the pump.

## 5. Data Integrity & Edge-Case Hunter (OCR Engine)
- **Math-First Logic**: OCR is a guess; Math is a fact. Prioritize (Total / Volume) ratios within [0.9 - 3.0 €/L].
- **Heuristic Validation**: If the ratio is coherent but the digit count is low (e.g., 2.67 vs 1.75), prioritize combinations that use MORE digits from the raw output.
- **Soudure Morphologique**: For 7-segment displays, use aggressive Dilation/Closing to bridge gaps between segments before OCR.
- **Audit Logging**: Store original raw OCR text in a hidden debug field.

## Implementation Rules
1. **Analyze** for 10 seconds before any code.
2. **Challenge** the user if a request violates mobile UX or data safety.
3. **No Slop**: Avoid generic patterns. Every component must feel custom-designed for Octrack.