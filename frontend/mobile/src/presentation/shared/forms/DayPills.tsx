import { Pressable, ScrollView, View } from 'react-native'
import type { Category } from '../../../domain/models'
import { categoryColor } from '../ui/category-colors'
import { Copy, useTheme } from '../ui/native-ui'

export function DayPills({
  items,
  category,
  multiple = false,
  disabled = false,
  onPress,
}: {
  items: {
    key: string
    label: string
    accessibilityLabel: string
    selected: boolean
    caption?: string
  }[]
  category: Category
  multiple?: boolean
  disabled?: boolean
  onPress: (key: string) => void
}) {
  const theme = useTheme(),
    color = categoryColor(category, theme.dark)
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, gap: 4 }}
    >
      {items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole={multiple ? 'checkbox' : 'button'}
          accessibilityLabel={item.accessibilityLabel}
          accessibilityState={{
            ...(multiple
              ? { checked: item.selected }
              : { selected: item.selected }),
            disabled,
          }}
          disabled={disabled}
          onPress={() => onPress(item.key)}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 44,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
          })}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: item.selected ? color.tint : theme.selected,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: item.selected ? 1 : 0,
              borderColor: color.ink,
            }}
          >
            <Copy
              style={{
                fontSize: 15,
                fontWeight: item.selected ? '600' : '400',
                color: item.selected ? color.ink : theme.secondary,
              }}
            >
              {item.label}
            </Copy>
          </View>
          {item.caption && (
            <Copy
              style={{
                fontSize: 12,
                color: item.selected ? color.ink : theme.secondary,
              }}
            >
              {item.caption}
            </Copy>
          )}
        </Pressable>
      ))}
    </ScrollView>
  )
}
