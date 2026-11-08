import { useRef, useState } from 'react'
import { useApp } from '../../../application/providers'
import { errorMessage } from '../../../domain/api-error'

export function useLoginController() {
  const { runtime, status, error, signIn, restore } = useApp()
  const [pat, setPat] = useState(''),
    [localError, setLocalError] = useState(''),
    [pendingMethod, setPendingMethod] = useState<'pat' | 'oidc' | null>(null)
  const [feedback, setFeedback] = useState<
    'idle' | 'pending' | 'success' | 'error'
  >('idle')
  const sending = useRef(false),
    busy = status === 'restoring' || pendingMethod !== null
  async function connect(oidc = false) {
    if (sending.current || busy || (!runtime.fake && !oidc && !pat.trim()))
      return false
    sending.current = true
    setPendingMethod(oidc ? 'oidc' : 'pat')
    setFeedback('pending')
    setLocalError('')
    const token = pat.trim()
    setPat('')
    try {
      const result = await signIn(oidc ? undefined : runtime.fake ? '' : token)
      setFeedback(result ? 'success' : 'error')
      return result
    } catch (e) {
      setLocalError(errorMessage(e))
      setFeedback('error')
      return false
    } finally {
      sending.current = false
    }
  }
  return {
    feedback,
    pendingMethod,
    finishConnect: () => {
      setPendingMethod(null)
      setFeedback('idle')
    },
    isDemo: !!runtime.fake,
    oidcEnabled: runtime.oidc.enabled,
    status,
    error,
    restore,
    pat,
    setPat,
    localError,
    setLocalError,
    busy,
    connect,
  }
}
export type LoginController = ReturnType<typeof useLoginController>
