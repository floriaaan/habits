// Monotone cubic interpolation: smooth joins, no overshoot or lines across missing days.
export function smoothLinePaths(
  values: readonly (number | null)[],
  width = 100,
  height = 54,
  padding = 6,
): string[] {
  const paths: string[] = [],
    segments: { x: number; y: number }[][] = []
  let segment: { x: number; y: number }[] = []
  values.forEach((value, i) => {
    if (value === null || !Number.isFinite(value)) {
      if (segment.length) segments.push(segment)
      segment = []
      return
    }
    segment.push({
      x: values.length < 2 ? width / 2 : (i * width) / (values.length - 1),
      y:
        height -
        padding -
        (Math.max(0, Math.min(100, value)) / 100) * (height - 2 * padding),
    })
  })
  if (segment.length) segments.push(segment)
  const n = (value: number) => Number(value.toFixed(3))
  for (const points of segments) {
    if (points.length < 2) continue
    const slopes = points
      .slice(1)
      .map((point, i) => (point.y - points[i]!.y) / (point.x - points[i]!.x))
    const tangents = points.map((_, i) => {
      if (i === 0) return slopes[0]!
      if (i === points.length - 1) return slopes[i - 1]!
      const a = slopes[i - 1]!,
        b = slopes[i]!
      return a * b <= 0 ? 0 : (2 * a * b) / (a + b)
    })
    let path = `M ${n(points[0]!.x)} ${n(points[0]!.y)}`
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!,
        dx = (b.x - a.x) / 3
      path += ` C ${n(a.x + dx)} ${n(a.y + tangents[i - 1]! * dx)} ${n(b.x - dx)} ${n(b.y - tangents[i]! * dx)} ${n(b.x)} ${n(b.y)}`
    }
    paths.push(path)
  }
  return paths
}
