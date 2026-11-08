import { useEffect, useRef, useState } from 'react'
import { ApiError, errorMessage } from '../domain/api-error'
import type { Session } from '../domain/models'
import type { Credentials, Runtime } from './ports'
import { queryClient } from './query-client'

export function useSessionController(runtime: Runtime) {
  const [session, setSession] = useState<Session | null>(null),
    [status, setStatus] = useState<
      'restoring' | 'signedOut' | 'authenticated' | 'unavailable'
    >('restoring'),
    [error, setError] = useState('')
  const epoch = useRef(0)
  const [queriesPaused, setQueriesPaused] = useState(false)
  async function pauseQueries() {
    setQueriesPaused(true)
    await queryClient.cancelQueries()
  }
  function resumeQueries() {
    setQueriesPaused(false)
  }
  async function clearCache() {
    await queryClient.cancelQueries()
    queryClient.clear()
  }
  async function restore() {
    const request = ++epoch.current
    setStatus('restoring')
    setError('')
    try {
      if (runtime.fake) {
        const current = await runtime.connector.getSession()
        if (request === epoch.current) {
          setSession(current)
          setStatus('authenticated')
          setQueriesPaused(false)
        }
        return
      }
      await runtime.vault.restore()
      if (request !== epoch.current) return
      if (!(await runtime.vault.getToken())) {
        if (request === epoch.current) setStatus('signedOut')
        return
      }
      const current = await runtime.connector.getSession()
      if (request === epoch.current) {
        setSession(current)
        setStatus('authenticated')
        setQueriesPaused(false)
      }
    } catch (error) {
      if (request === epoch.current) {
        setError(errorMessage(error))
        setStatus(
          error instanceof ApiError && error.status === 401
            ? 'signedOut'
            : 'unavailable',
        )
      }
    }
  }
  useEffect(() => {
    runtime.vault.onInvalid = () => {
      epoch.current++
      setSession(null)
      setStatus('signedOut')
      void clearCache()
    }
    void restore()
    return () => {
      epoch.current++
      runtime.vault.onInvalid = () => {}
    }
  }, [runtime])
  async function signIn(
    pat?: string,
    account?: { email: string; password: string },
  ) {
    const request = ++epoch.current
    setError('')
    setStatus('restoring')
    await clearCache()
    try {
      if (runtime.fake) {
        const session = await runtime.connector.getSession()
        if (request === epoch.current) {
          setSession(session)
          setStatus('authenticated')
          setQueriesPaused(false)
        }
        return request === epoch.current
      }
      const credentials: Credentials | null = account
        ? await runtime.accounts.login(account.email, account.password)
        : pat === undefined
          ? await runtime.oidc.signIn()
          : {
              origin: runtime.config.origin,
              kind: 'pat',
              accessToken: pat.trim(),
            }
      if (request !== epoch.current) return false
      if (!credentials) {
        setStatus('signedOut')
        return false
      }
      const current = await runtime.verify(credentials)
      if (request !== epoch.current) return false
      await runtime.vault.install(credentials)
      if (request === epoch.current) {
        setSession(current)
        setStatus('authenticated')
        setQueriesPaused(false)
        return true
      }
      return false
    } catch (error) {
      if (request === epoch.current) {
        setSession(null)
        setStatus('signedOut')
        setError(errorMessage(error))
      }
      return false
    }
  }
  async function signOut() {
    const credentials = runtime.vault.current?.()
    if (credentials?.kind === 'account') {
      // Keep the session available for retry if server-side revocation fails.
      await runtime.accounts.logout(credentials)
    }
    epoch.current++
    setSession(null)
    setStatus('signedOut')
    setError('')
    await clearCache()
    await runtime.vault.invalidate(runtime.vault.generation)
  }
  return {
    session,
    status,
    error,
    signIn,
    signOut,
    restore,
    queriesPaused,
    pauseQueries,
    resumeQueries,
    epoch: epoch.current,
  }
}
