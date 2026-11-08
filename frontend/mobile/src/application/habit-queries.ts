import { useDomainQuery } from './queries'

// Keep resource keys stable across screens so mutations invalidate every reader.
export function useDashboardQuery(enabled: boolean) {
  return useDomainQuery(
    'dashboard',
    [],
    (connector, options) => connector.getDashboard(options),
    enabled,
  )
}
export function useHabitStatisticsQuery(
  id: string | undefined,
  enabled: boolean,
) {
  return useDomainQuery(
    'statistics',
    [id],
    (connector, options) => connector.getStatistics(id!, options),
    enabled && !!id,
  )
}
