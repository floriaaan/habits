import { Redirect } from 'expo-router'
import { useApp } from '../../../application/providers'
import { ProfileView } from './ProfileView'
import { useProfileController } from './useProfileController'

export function ProfileScreen() {
  const { status, session } = useApp()
  if (status !== 'authenticated' || !session) return <Redirect href="/" />
  return <Content key={session.user_id} />
}
function Content() {
  const model = useProfileController()
  return <ProfileView model={model} />
}
