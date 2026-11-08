import { HomeView } from './HomeView'
import { useHomeController } from './useHomeController'

export function HomeScreen() {
  const model = useHomeController()
  return <HomeView model={model} />
}
