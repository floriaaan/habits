import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../domain/api-error'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, error) =>
        count < 2 &&
        error instanceof ApiError &&
        (error.status >= 500 ||
          ['network_error', 'timeout'].includes(error.code)),
    },
    mutations: { retry: false, gcTime: 0, networkMode: 'always' },
  },
})
