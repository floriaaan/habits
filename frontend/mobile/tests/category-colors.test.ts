import assert from 'node:assert/strict'
import test from 'node:test'
import type { Category } from '../src/domain/models'
import { categoryColor } from '../src/presentation/shared/ui/category-colors'

function luminance(hex: string) {
  const rgb = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return rgb.reduce(
    (sum, value, index) => sum + value * ([0.2126, 0.7152, 0.0722][index] ?? 0),
    0,
  )
}

test('category labels remain readable on ordinary and selected surfaces in both themes', () => {
  const categories: Category[] = ['sport', 'mind', 'daily', 'nutrition']
  assert.equal(
    new Set(categories.map((category) => categoryColor(category).accent)).size,
    4,
  )
  for (const dark of [false, true]) {
    for (const category of categories) {
      const color = categoryColor(category, dark)
      for (const surface of [dark ? '#242627' : '#f8f8f8', color.tint]) {
        const a = luminance(color.ink),
          b = luminance(surface)
        const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        assert.ok(contrast >= 4.5, `${category} dark=${dark}: ${contrast}`)
      }
    }
  }
})
