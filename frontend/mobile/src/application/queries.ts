import { retainPreviousRevision } from './query-retention'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { HabitsConnector, ReadOptions } from '../domain/connector'
import { useApp } from './providers'
export type Resource =
  | 'dashboard'
  | 'habits'
  | 'entries'
  | 'statistics'
  | 'gamification'
  | 'tokens'
  | 'integrations'
  | 'jobs'
  | 'diagnostic'
export function sessionKey(origin: string, mode: string, userId: string) {
  return [origin, mode, userId] as const
}
export function useDomainQuery<T>(
  resource: Resource,
  args: readonly unknown[],
  read: (connector: HabitsConnector, options: ReadOptions) => Promise<T>,
  enabled = true,
  options: { retainPreviousRevision?: boolean } = {},
) {
  const { runtime, session, status, queriesPaused } = useApp()
  const queryKey = [
    ...sessionKey(
      runtime.config.origin,
      runtime.config.mode,
      session?.user_id ?? '',
    ),
    resource,
    ...args,
  ]
  return useQuery<T>({
    queryKey,
    placeholderData: options.retainPreviousRevision
      ? (data, previous) =>
          retainPreviousRevision(data, queryKey, previous?.queryKey)
      : undefined,
    queryFn: ({ signal }) => read(runtime.connector, { signal }),
    enabled: enabled && status === 'authenticated' && !queriesPaused,
  })
}
export function useOperation() {
  const client = useQueryClient(),
    { runtime, session } = useApp()
  return useMutation({
    mutationFn: (input: {
      run: () => Promise<unknown>
      resources: Resource[]
    }) => input.run(),
    onSuccess: (_, input) =>
      Promise.all(
        input.resources.map((resource) =>
          client.invalidateQueries({
            queryKey: [
              ...sessionKey(
                runtime.config.origin,
                runtime.config.mode,
                session?.user_id ?? '',
              ),
              resource,
            ],
          }),
        ),
      ),
  })
}
export function useInvalidate() {
  const client = useQueryClient(),
    { runtime, session } = useApp()
  return (resources: Resource[]) =>
    Promise.all(
      resources.map((resource) =>
        client.invalidateQueries({
          queryKey: [
            ...sessionKey(
              runtime.config.origin,
              runtime.config.mode,
              session?.user_id ?? '',
            ),
            resource,
          ],
        }),
      ),
    )
}
