import type { DashboardHabit } from '../../../domain/models'
import { useWaterCard } from './useWaterCard'
import { WaterCardView } from './WaterCardView'

export function WaterCard(props: {
  item?: DashboardHabit
  height: number
  compact: boolean
}) {
  const model = useWaterCard(props)
  return <WaterCardView {...props} model={model} />
}
