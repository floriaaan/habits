import { Redirect } from 'expo-router'
import { LoginView } from './LoginView'
import { useLoginController } from './useLoginController'

export default function LoginScreen() {
  const model = useLoginController()
  if (model.status === 'authenticated' && !model.pendingMethod)
    return <Redirect href="/" />
  return <LoginView model={model} />
}
