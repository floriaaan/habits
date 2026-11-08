export function focusedScrollOffset(
  offset: number,
  inputTop: number,
  inputHeight: number,
  viewportTop: number,
  viewportHeight: number,
  keyboardTop: number,
) {
  const top = viewportTop + 16
  const bottom = Math.min(viewportTop + viewportHeight, keyboardTop) - 16
  if (bottom <= top) return offset
  if (inputTop < top) return Math.max(0, offset + inputTop - top)
  return Math.max(0, offset + Math.max(0, inputTop + inputHeight - bottom))
}
