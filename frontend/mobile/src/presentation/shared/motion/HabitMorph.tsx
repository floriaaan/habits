import { categoryColor } from '../ui/category-colors'
import { router, usePathname } from 'expo-router'
import { createContext, useContext, useRef, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import type { DashboardHabit } from '../../../domain/models'
import { habitProgress } from '../models/home-model'
import { Copy, Icon } from '../ui/primitives'
import { useTheme } from '../ui/theme'
import { usePrepareNativeTabMotion } from './TabCardMotion'
import type { TabPath } from './tab-motion-model'
interface MorphContext {
  open: (item: DashboardHabit) => void
  back: () => void
}
const Context = createContext<MorphContext | null>(null)
export function HabitMorphProvider({ children }: { children: ReactNode }) {
  const path = usePathname()
  const origin = useRef<TabPath>('/')
  const prepare = usePrepareNativeTabMotion()
  return (
    <Context.Provider
      value={{
        open: (item) => {
          origin.current = path as TabPath
          prepare(`/habit/${item.habit.id}`, path)
          router.push({
            pathname: '/habit/[id]',
            params: { id: item.habit.id, morph: '1' },
          })
        },
        back: () => {
          prepare(origin.current, path)
          router.back()
        },
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function useHabitMorph() {
  const context = useContext(Context)
  if (!context) throw new Error('HabitMorphProvider absent')
  return context
}
export function HabitMorphContent({ item }: { item: DashboardHabit }) {
  const theme = useTheme()
  const name =
    item.habit.unit === 'milliliters'
      ? ({ ios: 'drop', android: 'water_drop' } as const)
      : item.habit.kind === 'duration' && item.habit.category === 'mind'
        ? ({
            ios: 'figure.mind.and.body',
            android: 'self_improvement',
          } as const)
        : item.habit.category === 'sport'
          ? ({ ios: 'figure.run', android: 'directions_run' } as const)
          : item.habit.category === 'daily'
            ? ({ ios: 'sun.max', android: 'light_mode' } as const)
            : item.habit.category === 'nutrition'
              ? ({ ios: 'carrot', android: 'nutrition' } as const)
              : ({ ios: 'book', android: 'menu_book' } as const)
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 48,
      }}
    >
      <Icon
        name={name}
        color={categoryColor(item.habit.category, theme.dark).ink}
        size={30}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Copy
          accessibilityRole="header"
          style={{ fontSize: 19, fontWeight: '600', letterSpacing: -0.25 }}
        >
          {item.habit.name}
        </Copy>
        <Copy style={{ fontSize: 16, color: theme.secondary }}>
          {habitProgress(item)}
        </Copy>
      </View>
    </View>
  )
}
export function HabitMorphLink({ item }: { item: DashboardHabit }) {
  const morph = useHabitMorph(),
    theme = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        item.habit.name + ', ' + habitProgress(item) + '. Ouvrir les actions'
      }
      onPress={() => morph.open(item)}
      style={({ pressed }) => ({
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View
        collapsable={false}
        style={{ borderRadius: 26, backgroundColor: theme.surface }}
      >
        <HabitMorphContent item={item} />
      </View>
    </Pressable>
  )
}
