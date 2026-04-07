import type { Metadata, Viewport } from 'next'
import { Barlow_Condensed, DM_Sans } from 'next/font/google'
import './globals.css'
import { AppProvider } from '@/components/AppContext'
import { ThemeWrapper } from '@/components/ThemeWrapper'
import { BottomNav } from '@/components/BottomNav'
import { GuestToast } from '@/components/GuestToast'

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-condensed',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Octrack',
  description: 'Suivez vos pleins, maîtrisez votre budget carburant',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Octrack',
    startupImage: [],
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0D0D0D',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${barlowCondensed.variable} ${dmSans.variable}`}>
        <AppProvider>
          <ThemeWrapper>
            <div className="max-w-[430px] mx-auto min-h-dvh relative">
              <main className="pb-nav">
                {children}
              </main>
              <BottomNav />
            </div>
            {/* Toast hors du max-w pour s'afficher pleine largeur côté droit */}
            <GuestToast />
          </ThemeWrapper>
        </AppProvider>
      </body>
    </html>
  )
}
