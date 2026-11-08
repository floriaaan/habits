import { Redirect } from 'expo-router'
import { useApp } from '../../../application/providers'
import { ProgressView } from './ProgressView'
import { useProgressController } from './useProgressController'

export function ProgressScreen() {
  const { status, session } = useApp()
  if (status !== 'authenticated' || !session) return <Redirect href="/" />
  return <Content key={session.user_id} />
}
function Content() {
  const model = useProgressController()
  return <ProgressView model={model} />
}
