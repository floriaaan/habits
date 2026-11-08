import { Redirect, useLocalSearchParams } from 'expo-router'
import { useApp } from '../../../application/providers'
import { ActivityView } from './ActivityView'
import { useActivityController } from './useActivityController'

export default function ActivityScreen() {
  const { id, morph } = useLocalSearchParams<{ id: string; morph?: string }>()
  const { status, session } = useApp()
  const model = useActivityController(id)
  if (status !== 'authenticated' || !session) return <Redirect href="/" />
  return (
    <ActivityView id={id} morphParam={morph} session={session} model={model} />
  )
}
