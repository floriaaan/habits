import { Redirect } from 'expo-router'
import { useApp } from '../../../application/providers'
import { IntegrationsView } from './IntegrationsView'
import { useIntegrationsController } from './useIntegrationsController'

export function IntegrationsScreen() {
  const { status, session } = useApp()
  if (status !== 'authenticated' || !session) return <Redirect href="/" />
  return <Content key={session.user_id} />
}
function Content() {
  const model = useIntegrationsController()
  return <IntegrationsView model={model} />
}
