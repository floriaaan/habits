import { DayPills } from '../../shared/forms/DayPills'
import { Pressable, View, useWindowDimensions } from 'react-native'
import { shiftDay, validRestDate, weekDays } from '../../../domain/calendar'
import { FormScrollView } from '../../shared/forms/FormScrollView'
import { NativeDateField } from '../../shared/forms/NativeDateField'
import { weekLabel } from '../../shared/forms/date-field-model'
import { KeyboardScreen } from '../../shared/forms/KeyboardScreen'
import { useDeviceInsets } from '../../shared/layout/DeviceInsets'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { categories } from '../../shared/models/home-model'
import { categoryColor } from '../../shared/ui/category-colors'
import {
  Button,
  Copy,
  Icon,
  deviceCornerRadius,
  useTheme,
} from '../../shared/ui/native-ui'
import type { RestController } from './useRestController'

function dateLabel(date: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'))
}
export function RestView({ model: m }: { model: RestController }) {
  const theme = useTheme(),
    insets = useDeviceInsets(),
    { width } = useWindowDimensions()
  const screen = `/rest/${m.habit.id}` as const,
    anchor = validRestDate(m.date) ? m.date : m.today
  return (
    <KeyboardScreen
      style={{
        flex: 1,
        gap: 6,
        paddingHorizontal: 6,
        backgroundColor: theme.canvas,
      }}
    >
      <MotionCard
        screen={screen}
        role="primary"
        style={{
          flex: 1,
          backgroundColor: theme.surface,
          borderRadius: 26,
          borderTopLeftRadius: deviceCornerRadius(insets.top, width),
          borderTopRightRadius: deviceCornerRadius(insets.top, width),
          paddingTop: insets.top + 8,
          width: '100%',
          maxWidth: 700,
          alignSelf: 'center',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            disabled={m.work}
            onPress={m.close}
            style={{
              minWidth: 44,
              minHeight: 48,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Icon
              name={{ ios: 'chevron.left', android: 'arrow_back' }}
              size={20}
              color={theme.text}
            />
          </Pressable>
          <Copy
            accessibilityRole="header"
            style={{
              flex: 1,
              textAlign: 'center',
              paddingRight: 44,
              fontSize: 18,
              fontWeight: '600',
            }}
          >
            Jour de repos
          </Copy>
        </View>
        <FormScrollView
          style={{ flex: 1 }}
          pointerEvents={m.work ? 'none' : 'auto'}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ padding: 20, gap: 24 }}
        >
          <View style={{ gap: 8 }}>
            <Copy
              accessibilityRole="header"
              style={{ fontSize: 24, fontWeight: '600' }}
            >
              Une pause pour {m.habit.name}
            </Copy>
            <Copy
              style={{
                fontSize: 14,
                color: categoryColor(m.habit.category, theme.dark).ink,
              }}
            >
              {categories[m.habit.category]}
            </Copy>
          </View>
          <View style={{ gap: 10 }}>
            <NativeDateField
              label="Date du repos"
              value={m.date}
              onChange={m.choose}
              disabled={!m.canWrite || m.work}
              minimum="1970-01-01"
              maximum="9999-12-31"
              hint={m.habit.timezone}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Semaine précédente"
                disabled={m.work || !m.canWrite || anchor < '1970-01-08'}
                onPress={() => m.choose(shiftDay(anchor, -7))}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  name={{ ios: 'chevron.left', android: 'chevron_left' }}
                  size={16}
                  color={theme.secondary}
                />
              </Pressable>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Copy style={{ fontSize: 13, textAlign: 'center' }}>
                  {weekLabel(anchor)}
                </Copy>
                {weekDays(anchor)[0] !== weekDays(m.today)[0] && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Revenir à cette semaine"
                    disabled={m.work || !m.canWrite}
                    onPress={() => m.choose(m.today)}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <Copy style={{ fontSize: 13, color: theme.secondary }}>
                      Aujourd’hui
                    </Copy>
                  </Pressable>
                )}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Semaine suivante"
                disabled={m.work || !m.canWrite || anchor > '9999-12-24'}
                onPress={() => m.choose(shiftDay(anchor, 7))}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  name={{ ios: 'chevron.right', android: 'chevron_right' }}
                  size={16}
                  color={theme.secondary}
                />
              </Pressable>
            </View>
            <DayPills
              category={m.habit.category}
              disabled={m.work || !m.canWrite}
              items={weekDays(anchor)
                .filter(validRestDate)
                .map((date) => ({
                  key: date,
                  label: new Intl.DateTimeFormat('fr-FR', {
                    weekday: 'narrow',
                    timeZone: 'UTC',
                  }).format(new Date(date + 'T12:00:00Z')),
                  caption: String(Number(date.slice(-2))),
                  accessibilityLabel: dateLabel(date),
                  selected: date === m.date,
                }))}
              onPress={m.choose}
            />
          </View>
          <MotionCard
            screen={screen}
            role="rest-info"
            colors={theme.blue}
            style={{ borderRadius: 18, padding: 18, gap: 10 }}
          >
            <Icon
              name={{ ios: 'bed.double', android: 'bed' }}
              size={24}
              color={theme.onPastel}
            />
            <Copy
              style={{ fontSize: 20, fontWeight: '600', color: theme.onPastel }}
            >
              {m.resting ? 'Un repos est prévu ce jour' : 'Une journée neutre'}
            </Copy>
            <Copy
              style={{ fontSize: 14, lineHeight: 21, color: theme.blueText }}
            >
              {m.resting
                ? 'Retirer ce repos rétablira le suivi de cette journée et recalculera votre progression.'
                : 'Votre série est préservée. Ce jour ne compte pas dans le suivi quotidien. Vos saisies restent conservées.'}
            </Copy>
            {m.habit.period === 'weekly' && (
              <Copy style={{ fontSize: 13, color: theme.blueText }}>
                L’objectif hebdomadaire reste inchangé.
              </Copy>
            )}
          </MotionCard>
          {!!m.error && (
            <Copy
              accessibilityRole="alert"
              style={{ color: theme.error, fontSize: 14 }}
            >
              {m.error}
            </Copy>
          )}
          {!m.canWrite && (
            <Copy style={{ color: theme.secondary, fontSize: 14 }}>
              {m.habit.archived_at
                ? 'Cette habitude est archivée.'
                : 'Votre accès ne permet pas de modifier les jours de repos.'}
            </Copy>
          )}
        </FormScrollView>
      </MotionCard>
      <MotionCard
        screen={screen}
        role="rest-footer"
        colors={theme.green}
        style={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 12),
          borderRadius: 26,
          width: '100%',
          maxWidth: 700,
          alignSelf: 'center',
        }}
      >
        <Button
          variant="primary"
          disabled={m.work || !m.canWrite || !validRestDate(m.date)}
          onPress={m.save}
          onFeedbackEnd={(outcome) => {
            if (outcome === 'success') m.finish()
          }}
        >
          {m.resting ? 'Retirer ce repos' : `Mettre ${m.habit.name} au repos`}
        </Button>
      </MotionCard>
    </KeyboardScreen>
  )
}
