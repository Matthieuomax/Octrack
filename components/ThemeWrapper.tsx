'use client'

import { useEffect, ReactNode } from 'react'
import { useApp } from './AppContext'

export function ThemeWrapper({ children }: { children: ReactNode }) {
  const { settings } = useApp()

  useEffect(() => {
    const html = document.documentElement

    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        html.classList.remove('light')
      } else {
        html.classList.add('light')
      }
    }

    if (settings.theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mq.matches)
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }

    applyTheme(settings.theme === 'dark')
  }, [settings.theme])

  return <>{children}</>
}
