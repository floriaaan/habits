import { weekLabel } from '../../shared/forms/date-field-model'
import { Pressable, ScrollView, View } from 'react-native'
import { shiftDay } from '../../../domain/calendar'
import { Copy, Icon, useTheme } from '../../shared/ui/native-ui'
import { weekDays } from './today-model'
import { dateLabel } from './today-visuals'
import { s } from './today.styles'
import type { TodayController } from './useTodayController'

type Props = Pick<
  TodayController,
  'today' | 'anchor' | 'earliest' | 'selected' | 'setWeek' | 'choose'
>
export function DaySelector({
  today,
  anchor,
  earliest,
  selected,
  setWeek,
  choose,
}: Props) {
  const theme = useTheme()

  return (
    <>
      {today && anchor && (
        <View style={{ gap: 6 }}>
          <View style={s.weekNavigation}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Semaine précédente"
              disabled={shiftDay(weekDays(anchor)[0]!, -1) < earliest}
              onPress={() => setWeek(shiftDay(anchor, -7))}
              style={s.iconButton}
            >
              <Icon
                name={{ ios: 'chevron.left', android: 'chevron_left' }}
                color={theme.secondary}
                size={17}
              />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Copy
                style={{
                  color: theme.secondary,
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                {weekLabel(anchor)}
              </Copy>
              {weekDays(anchor)[0] !== weekDays(today)[0] && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Revenir à aujourd’hui"
                  onPress={() => {
                    setWeek(null)
                    choose(today)
                  }}
                  style={s.returnToday}
                >
                  <Copy style={{ fontSize: 13 }}>Aujourd’hui</Copy>
                </Pressable>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Semaine suivante"
              disabled={weekDays(anchor)[6]! >= today}
              onPress={() => setWeek(shiftDay(anchor, 7))}
              style={s.iconButton}
            >
              <Icon
                name={{ ios: 'chevron.right', android: 'chevron_right' }}
                color={theme.secondary}
                size={17}
              />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, gap: 2 }}
          >
            {weekDays(anchor).map((date) => (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityLabel={dateLabel(date)}
                accessibilityState={{
                  selected: date === selected,
                  disabled: date > today || date < earliest,
                }}
                disabled={date > today || date < earliest}
                onPress={() => choose(date)}
                style={({ pressed }) => [
                  s.day,
                  {
                    backgroundColor:
                      date === selected ? theme.selected : 'transparent',
                    opacity:
                      date > today || date < earliest ? 0.3 : pressed ? 0.6 : 1,
                  },
                ]}
              >
                <Copy style={{ fontSize: 13, color: theme.secondary }}>
                  {new Intl.DateTimeFormat('fr-FR', {
                    weekday: 'narrow',
                    timeZone: 'UTC',
                  }).format(new Date(date + 'T12:00:00Z'))}
                </Copy>
                <Copy
                  style={{
                    fontSize: 17,
                    fontWeight: date === selected ? '600' : '400',
                  }}
                >
                  {Number(date.slice(-2))}
                </Copy>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </>
  )
}
