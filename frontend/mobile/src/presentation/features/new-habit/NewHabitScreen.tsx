import { Redirect } from 'expo-router'
import { useApp } from '../../../application/providers'
import { NewHabitView } from './NewHabitView'
import { useNewHabitController } from './useNewHabitController'

export default function NewHabitScreen() {
  const { status } = useApp()
  const model = useNewHabitController()
  if (status !== 'authenticated') return <Redirect href="/" />
  return <NewHabitView model={model} />
}
