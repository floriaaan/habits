export type ButtonOutcome = 'success' | 'error'

// Commands return false for a handled failure; TanStack refetches resolve with isError.
export async function buttonOutcome(
  request: PromiseLike<unknown>,
): Promise<ButtonOutcome> {
  try {
    const result = await request
    return result === false ||
      (!!result &&
        typeof result === 'object' &&
        'isError' in result &&
        result.isError === true)
      ? 'error'
      : 'success'
  } catch {
    return 'error'
  }
}
