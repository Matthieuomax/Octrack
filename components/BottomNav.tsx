'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Plus, History, BarChart2, MapPin } from 'lucide-react'
import { SyncBadge } from '@/components/AuthGate'
import { useApp } from '@/components/AppContext'

const NAV_ITEMS = [
  { href: '/', icon: Home, label: 'Accueil' },
  { href: '/history', icon: History, label: 'Historique' },
  { href: '/add', icon: Plus, label: 'Plein', isMain: true },
  { href: '/stats', icon: BarChart2, label: 'Stats' },
  { href: '/stations', icon: MapPin, label: 'Carte' },
]

export function BottomNav() {
  const pathname = usePathname()
  const { syncStatus } = useApp()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 max-w-[430px] mx-auto">
      <div
        className="border-t"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          paddingBottom: 'env(safe-area-inset-bottom, 8px)',
        }}
      >
        <div className="flex items-center justify-around px-2 pt-2 pb-1">
          {NAV_ITEMS.map(({ href, icon: Icon, label, isMain }) => {
            const active = pathname === href
            if (isMain) {
              return (
                <Link key={href} href={href} className="flex flex-col items-center -mt-5">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
                    style={{
                      backgroundColor: 'var(--color-accent)',
                      boxShadow: '0 4px 20px rgba(255,85,0,0.4)',
                    }}
                  >
                    <Icon size={24} color="white" strokeWidth={2.5} />
                  </div>
                  <span className="text-[10px] mt-1 font-medium" style={{ color: 'var(--color-accent)' }}>
                    {label}
                  </span>
                </Link>
              )
            }

            // Onglet Accueil : badge sync discret
            if (href === '/') {
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all active:scale-95 relative"
                >
                  <div className="relative">
                    <Icon
                      size={22}
                      strokeWidth={active ? 2.5 : 1.8}
                      style={{ color: active ? 'var(--color-accent)' : 'var(--color-muted)' }}
                    />
                    {/* Point de sync */}
                    {syncStatus === 'syncing' && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-current"
                        style={{ backgroundColor: '#FF8833', borderColor: 'var(--color-surface)' }}
                      />
                    )}
                    {syncStatus === 'error' && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                        style={{ backgroundColor: '#FF4422', border: '1.5px solid var(--color-surface)' }}
                      />
                    )}
                  </div>
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: active ? 'var(--color-accent)' : 'var(--color-muted)' }}
                  >
                    {label}
                  </span>
                </Link>
              )
            }

            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all active:scale-95"
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.5 : 1.8}
                  style={{ color: active ? 'var(--color-accent)' : 'var(--color-muted)' }}
                />
                <span
                  className="text-[10px] font-medium"
                  style={{ color: active ? 'var(--color-accent)' : 'var(--color-muted)' }}
                >
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Badge sync flottant (visible au-dessus de la nav quand pending > 0) */}
      <div className="absolute top-0 right-2 -translate-y-full pb-1 pointer-events-none">
        <SyncBadge />
      </div>
    </nav>
  )
}
