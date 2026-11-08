import { Redirect } from 'expo-router'
import { useApp } from '../../../application/providers'
import { TodayView } from './TodayView'
import { useTodayController } from './useTodayController'

export function TodayScreen() {
  const { status, session } = useApp()
  if (status !== 'authenticated' || !session) return <Redirect href="/" />
  return <Content key={session.user_id} />
}
function Content() {
  const model = useTodayController()
  return <TodayView model={model} />
}
