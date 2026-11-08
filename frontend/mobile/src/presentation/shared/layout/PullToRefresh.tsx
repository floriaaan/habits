import { useEffect, useRef, useState } from 'react'
import { RefreshControl, type RefreshControlProps } from 'react-native'

type Props = Omit<RefreshControlProps, 'refreshing' | 'onRefresh'> & {
  onRefresh: () => Promise<unknown>
}

// The native spinner moves the scroll offset on iOS. Only a pull gesture may
// activate it; background query revalidation must never drive `refreshing`.
export function PullToRefresh({ onRefresh, ...props }: Props) {
  const [refreshing, setRefreshing] = useState(false)
  const pending = useRef(false),
    mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function refresh() {
    if (pending.current) return
    pending.current = true
    setRefreshing(true)
    try {
      await onRefresh()
    } catch {
      // The owning query displays its error; always release the native spinner.
    } finally {
      pending.current = false
      if (mounted.current) setRefreshing(false)
    }
  }

  return (
    <RefreshControl
      {...props}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
    />
  )
}
