import { randomUUID } from 'expo-crypto'
import { useEffect, useRef, useState } from 'react'
import { Alert, AppState, Linking } from 'react-native'
import { authorizeStrava } from '../../../application/integration-commands'
import { useApp } from '../../../application/providers'
import { useDomainQuery, useInvalidate } from '../../../application/queries'
import { errorMessage } from '../../../domain/api-error'
import type { Integration } from '../../../domain/models'

export function useIntegrationsController() {
  const { runtime, session } = useApp()
  const allowed = !!session?.scopes.includes('integrations:manage')
  const query = useDomainQuery(
    'integrations',
    [],
    (connector, options) => connector.listIntegrations(options),
    allowed,
  )
  const invalidate = useInvalidate()
  const [selected, setSelected] = useState<Integration['provider'] | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const locked = useRef(false)
  const syncKey = useRef<string | null>(null)
  const { refetch } = query
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setToken('')
      if (state === 'active' && allowed) void refetch()
    })
    return () => listener.remove()
  }, [allowed, refetch])

  function select(provider: Integration['provider'] | null) {
    if (locked.current) return
    setSelected(provider)
    setToken('')
    setError('')
    setNotice('')
  }
  async function run(action: () => Promise<void>) {
    if (locked.current || !allowed) return false
    locked.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      await invalidate(['integrations', 'jobs'])
      return true
    } catch (error) {
      setError(errorMessage(error))
      return false
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  function connectStrava() {
    return run(async () => {
      await authorizeStrava(runtime.connector, Linking.openURL, !!runtime.fake)
      setNotice(
        runtime.fake
          ? 'Connexion simulée.'
          : 'Terminez la connexion dans Strava, puis revenez ici.',
      )
    })
  }
  function connectHomeAssistant() {
    const value = token.trim()
    if (!value) return Promise.resolve(false)
    // Credentials stay out of the Query mutation cache and are cleared before sending.
    setToken('')
    return run(async () => {
      await runtime.connector.connectHomeAssistant({ token: value })
      setNotice(
        runtime.fake ? 'Connexion simulée.' : 'Home Assistant est connecté.',
      )
    })
  }
  function syncStrava() {
    return run(async () => {
      syncKey.current ??= randomUUID()
      await runtime.connector.syncStrava({ key: syncKey.current })
      syncKey.current = null
      setNotice(
        'Synchronisation demandée. Les activités seront traitées en arrière-plan.',
      )
    })
  }
  function disconnect(integration: Integration) {
    Alert.alert(
      'Déconnecter le service ?',
      'La synchronisation de ce service sera arrêtée.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnecter',
          style: 'destructive',
          onPress: () => {
            void run(async () => {
              await runtime.connector.disconnectIntegration(integration.id)
              setNotice('Service déconnecté.')
            })
          },
        },
      ],
    )
  }
  return {
    allowed,
    query,
    selected,
    select,
    token,
    setToken,
    busy,
    error,
    notice,
    demo: !!runtime.fake,
    connectStrava,
    connectHomeAssistant,
    syncStrava,
    disconnect,
  }
}
export type IntegrationsController = ReturnType<
  typeof useIntegrationsController
>
