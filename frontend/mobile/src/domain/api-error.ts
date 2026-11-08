export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError)
    return `${error.message} (${error.code}${error.requestId ? ` · ${error.requestId}` : ''})`
  return error instanceof Error ? error.message : 'Une erreur est survenue.'
}
