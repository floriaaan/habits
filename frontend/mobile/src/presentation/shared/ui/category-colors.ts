import type { Category } from '../../../domain/models'

// Shared category identity. Bright accents decorate; darker inks label light surfaces.
const palette = {
  sport: {
    accent: '#ff375f',
    darkInk: '#ff7b8f',
    ink: '#bd2142',
    tint: '#ffe8ed',
    darkTint: '#48252e',
  },
  mind: {
    accent: '#0a84ff',
    darkInk: '#64b5ff',
    ink: '#0063bd',
    tint: '#e5f1ff',
    darkTint: '#203b54',
  },
  daily: {
    accent: '#ffd60a',
    darkInk: '#ffd60a',
    ink: '#805d00',
    tint: '#fff5cc',
    darkTint: '#453d20',
  },
  nutrition: {
    accent: '#30d158',
    darkInk: '#30d158',
    ink: '#247a35',
    tint: '#e5f7e9',
    darkTint: '#263f2c',
  },
} satisfies Record<
  Category,
  {
    accent: string
    darkInk: string
    ink: string
    tint: string
    darkTint: string
  }
>

export function categoryColor(category: Category, dark = false) {
  const color = palette[category]
  return {
    accent: color.accent,
    ink: dark ? color.darkInk : color.ink,
    tint: dark ? color.darkTint : color.tint,
  }
}
