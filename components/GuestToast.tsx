'use client'

/**
 * GuestToast — notification discrète (une fois par session)
 * incitant l'utilisateur non connecté à créer un compte.
 * Apparaît en haut à droite après 4 secondes, se ferme seul après 8s.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, CloudOff } from 'lucide-react'
import { useApp } from '@/components/AppContext'

const SESSION_KEY = 'octrack_guest_toast_shown'

export function GuestToast() {
  const { user, authLoading } = useApp()
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (user) return
    if (typeof sessionStorage === 'undefined') return
    if (sessionStorage.getItem(SESSION_KEY)) return

    // Apparaît après 4 secondes
    const show = setTimeout(() => setVisible(true), 4000)
    return () => clearTimeout(show)
  }, [authLoading, user])

  // Auto-dismiss après 8 secondes d'affichage
  useEffect(() => {
    if (!visible) return
    const hide = setTimeout(() => dismiss(), 8000)
    return () => clearTimeout(hide)
  }, [visible])

  const dismiss = () => {
    setExiting(true)
    sessionStorage.setItem(SESSION_KEY, '1')
    setTimeout(() => setVisible(false), 350)
  }

  if (!visible) return null

  return (
    <div
      className="fixed z-[200] pointer-events-none"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        right: '12px',
        left: '12px',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        className="pointer-events-auto"
        style={{
          maxWidth: '290px',
          width: '100%',
          animation: exiting
            ? 'toastOut 0.35s cubic-bezier(0.4, 0, 1, 1) forwards'
            : 'toastIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        }}
      >
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #141420 0%, #0E0E18 100%)',
            border: '1px solid rgba(255,107,0,0.18)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {/* Barre de progression */}
          <div
            className="h-0.5 w-full"
            style={{ backgroundColor: 'rgba(255,107,0,0.15)' }}
          >
            <div
              className="h-full"
              style={{
                background: 'linear-gradient(90deg, #FF5500, #FF8800)',
                animation: 'toastProgress 8s linear forwards',
                transformOrigin: 'left',
              }}
            />
          </div>

          <div className="flex items-start gap-3 px-4 py-3">
            {/* Icône */}
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{
                background: 'linear-gradient(135deg, rgba(255,107,0,0.2) 0%, rgba(255,107,0,0.08) 100%)',
                border: '1px solid rgba(255,107,0,0.2)',
              }}
            >
              <CloudOff size={14} style={{ color: '#FF8833' }} />
            </div>

            {/* Contenu */}
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-black uppercase tracking-[0.1em] mb-0.5"
                style={{
                  color: 'rgba(255,255,255,0.85)',
                  fontFamily: 'var(--font-condensed)',
                }}
              >
                Mode local uniquement
              </p>
              <p
                className="text-[10px] leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.38)', fontFamily: 'var(--font-sans)' }}
              >
                Créez un compte pour sauvegarder vos pleins dans le cloud.
              </p>
              <Link
                href="/login"
                onClick={dismiss}
                className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold uppercase tracking-widest transition-opacity active:opacity-60"
                style={{
                  color: '#FF8833',
                  fontFamily: 'var(--font-condensed)',
                  letterSpacing: '0.12em',
                }}
              >
                Créer un compte
                <span style={{ opacity: 0.6 }}>→</span>
              </Link>
            </div>

            {/* Fermer */}
            <button
              onClick={dismiss}
              className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center -mt-0.5 transition-all active:opacity-60"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            >
              <X size={11} style={{ color: 'rgba(255,255,255,0.35)' }} />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(20px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes toastOut {
          from { opacity: 1; transform: translateX(0) scale(1); }
          to   { opacity: 0; transform: translateX(16px) scale(0.96); }
        }
        @keyframes toastProgress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  )
}
