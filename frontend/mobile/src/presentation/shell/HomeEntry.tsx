import { View } from 'react-native'
import { useApp } from '../../application/providers'
import { WelcomeScreen } from '../features/auth/WelcomeScreen'
import { HomeScreen } from '../features/home/HomeScreen'

export function HomeEntry() {
  const { status, session, runtime } = useApp()
  // Fake sessions open automatically; never flash onboarding while restoring.
  if (runtime.fake && status === 'restoring')
    return <View style={{ flex: 1, backgroundColor: '#0c1011' }} />
  if (status !== 'authenticated' || !session) return <WelcomeScreen />
  return <HomeScreen key={session.user_id} />
}
