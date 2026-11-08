import { useEffect, useRef, useState } from 'react'
import type { AppearanceAdapter } from './ports'

export const appearanceLabels = {
  system: 'Système',
  light: 'Clair',
  dark: 'Sombre',
} as const
export type AppearancePreference = keyof typeof appearanceLabels
export function useAppearancePreference(adapter: AppearanceAdapter) {
  const [appearance, setAppearance] = useState<AppearancePreference>('system')
  const [appearanceBusy, setBusy] = useState(true)
  const mounted = useRef(true),
    busy = useRef(true)
  useEffect(() => {
    mounted.current = true
    void adapter
      .read()
      .then((value) => {
        if (
          !mounted.current ||
          (value !== 'system' && value !== 'light' && value !== 'dark')
        )
          return
        adapter.apply(value)
        setAppearance(value)
      })
      .catch(() => {})
      .finally(() => {
        if (mounted.current) {
          busy.current = false
          setBusy(false)
        }
      })
    return () => {
      mounted.current = false
    }
  }, [adapter])
  async function changeAppearance(value: AppearancePreference) {
    if (busy.current) return
    busy.current = true
    setBusy(true)
    try {
      await adapter.write(value)
      if (mounted.current) {
        adapter.apply(value)
        setAppearance(value)
      }
    } finally {
      busy.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return { appearance, appearanceBusy, changeAppearance }
}
