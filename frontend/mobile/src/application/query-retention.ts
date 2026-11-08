// Retain a displayed result only across revisions of the same session/resource/date.
export function retainPreviousRevision<T>(
  data: T | undefined,
  current: readonly unknown[],
  previous: readonly unknown[] | undefined,
): T | undefined {
  return previous &&
    current.length === previous.length &&
    current
      .slice(0, -1)
      .every((part, index) => Object.is(part, previous[index]))
    ? data
    : undefined
}
