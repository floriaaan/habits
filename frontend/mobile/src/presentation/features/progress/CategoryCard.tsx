import { categoryColor } from '../../shared/ui/category-colors'
import { useHabitMorph } from '../../shared/motion/HabitMorph'
import { Pressable, StyleSheet, View } from 'react-native'
import {
  categories,
  habitProgress,
  percent,
} from '../../shared/models/home-model'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { Copy, Icon, useTheme } from '../../shared/ui/native-ui'
import { s } from './progress.styles'

import type { ProgressController } from './useProgressController'

type Props = Pick<ProgressController, 'data' | 'expanded' | 'setExpanded'>
export function CategoryCard({ data, expanded, setExpanded }: Props) {
  const theme = useTheme()
  const morph = useHabitMorph()
  if (!data) return null
  return (
    <MotionCard
      screen="/progress"
      surfaceOrder={2}
      role="categories"
      style={[s.card, { backgroundColor: theme.surface }]}
    >
      <Copy accessibilityRole="header" style={s.heading}>
        Par catégorie
      </Copy>
      <Copy style={{ color: theme.secondary, fontSize: 12, marginTop: 3 }}>
        Aujourd’hui
      </Copy>
      {data.groups.map((group) => (
        <View key={group.category}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: expanded === group.category }}
            onPress={() =>
              setExpanded(expanded === group.category ? null : group.category)
            }
            style={({ pressed }) => ({
              minHeight: 54,
              paddingVertical: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              opacity: pressed ? 0.6 : 1,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.selected,
            })}
          >
            <Icon
              name={categoryIcons[group.category]}
              color={categoryColor(group.category, theme.dark).ink}
              size={21}
            />
            <Copy style={{ flex: 1, fontSize: 15 }}>
              {categories[group.category]}
            </Copy>
            <Copy style={{ fontSize: 15 }}>{percent(group.percent)}</Copy>
            <Icon
              name={{
                ios:
                  expanded === group.category
                    ? 'chevron.down'
                    : 'chevron.right',
                android:
                  expanded === group.category ? 'expand_more' : 'chevron_right',
              }}
              color={theme.secondary}
              size={15}
            />
          </Pressable>
          {expanded === group.category && (
            <View style={{ paddingTop: 8, gap: 4 }}>
              {group.habits.length ? (
                group.habits.map((item) => (
                  <Pressable
                    key={item.habit.id}
                    accessibilityRole="button"
                    onPress={() => morph.open(item)}
                    style={{
                      minHeight: 52,
                      justifyContent: 'center',
                      paddingLeft: 32,
                      gap: 3,
                    }}
                  >
                    <Copy style={{ fontSize: 14 }}>{item.habit.name}</Copy>
                    <Copy style={{ color: theme.secondary, fontSize: 12 }}>
                      {habitProgress(item)}
                    </Copy>
                  </Pressable>
                ))
              ) : (
                <Copy style={{ color: theme.secondary, fontSize: 14 }}>
                  Aucune habitude dans cette catégorie.
                </Copy>
              )}
            </View>
          )}
        </View>
      ))}
    </MotionCard>
  )
}
const categoryIcons = {
  sport: { ios: 'figure.run', android: 'directions_run' },
  mind: { ios: 'brain.head.profile', android: 'psychology' },
  daily: { ios: 'checkmark.circle', android: 'check_circle' },
  nutrition: { ios: 'fork.knife', android: 'restaurant' },
} as const
