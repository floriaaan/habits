import { router } from 'expo-router'
import { usePrepareNativeTabMotion } from '../../shared/motion/TabCardMotion'
import { MotionCard } from '../../shared/motion/TabCardMotion'
import { ActivityIndicator, StyleSheet, Pressable } from 'react-native'
import { errorMessage } from '../../../domain/api-error'
import { amount } from '../../shared/models/home-model'
import { Button, Copy, Icon, useTheme } from '../../shared/ui/native-ui'
import { s } from './activity.styles'
import type { ActivityController } from './useActivityController'

type Props = Pick<ActivityController, 'item' | 'entries'> & {
  canRead: boolean
  canWrite: boolean
}
export function RecentEntriesCard({ item, entries, canRead, canWrite }: Props) {
  const theme = useTheme()
  const prepare = usePrepareNativeTabMotion()
  const card = [s.card, { backgroundColor: theme.surface }]
  if (!item) return null
  return (
    <MotionCard
      screen={`/habit/${item.habit.id}`}
      role="entries"
      surfaceOrder={2}
      style={card}
    >
      <Copy accessibilityRole="header" style={s.heading}>
        Dernières saisies
      </Copy>
      {!canRead ? (
        <Copy>Votre accès ne permet pas de lire les saisies.</Copy>
      ) : entries.error ? (
        <>
          <Copy accessibilityRole="alert">{errorMessage(entries.error)}</Copy>
          <Button onPress={() => entries.refetch()}>Réessayer</Button>
        </>
      ) : !entries.data ? (
        <ActivityIndicator />
      ) : !entries.data.items.length ? (
        <Copy style={{ color: theme.secondary }}>
          Aucune saisie pour le moment.
        </Copy>
      ) : (
        [...entries.data.items]
          .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
          .slice(0, 5)
          .map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole={canWrite ? 'button' : undefined}
              disabled={!canWrite}
              onPress={() => {
                prepare(`/entry/${entry.id}`, `/habit/${item.habit.id}`)
                router.push({
                  pathname: '/entry/[id]',
                  params: { id: entry.id, habitId: item.habit.id },
                })
              }}
              accessible
              accessibilityLabel={`${new Date(entry.occurred_at).toLocaleString('fr-FR', { timeZone: item.habit.timezone })}, ${amount(entry.value, item.habit.unit)}`}
              style={[
                s.row,
                {
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  minHeight: 48,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.selected,
                },
              ]}
            >
              <Copy style={{ fontSize: 13, color: theme.secondary }}>
                {new Date(entry.occurred_at).toLocaleString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: item.habit.timezone,
                })}
              </Copy>
              <Copy style={{ fontSize: 16, fontWeight: '600' }}>
                {amount(entry.value, item.habit.unit)}
              </Copy>
              {canWrite && (
                <Icon
                  name={{ ios: 'chevron.right', android: 'chevron_right' }}
                  size={16}
                  color={theme.secondary}
                />
              )}
            </Pressable>
          ))
      )}
    </MotionCard>
  )
}
