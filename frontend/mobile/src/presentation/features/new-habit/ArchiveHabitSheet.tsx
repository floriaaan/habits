import { Modal, Pressable, ScrollView, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { useDeviceInsets } from '../../shared/layout/DeviceInsets'
import { amount, categories } from '../../shared/models/home-model'
import { Button, Copy, Icon, useTheme } from '../../shared/ui/native-ui'
import { categoryColor } from '../../shared/ui/category-colors'
import type { EditHabitController } from './useEditHabitController'

type Props = Pick<
  EditHabitController,
  | 'snapshot'
  | 'archiveVisible'
  | 'dismissArchive'
  | 'archive'
  | 'finishArchive'
  | 'work'
  | 'error'
  | 'archiveCommitted'
>
export function ArchiveHabitSheet(m: Props) {
  const theme = useTheme(),
    insets = useDeviceInsets(),
    reduced = useReducedMotion()
  const habit = m.snapshot.habit,
    busy = !!m.work || m.archiveCommitted
  return (
    <Modal
      visible={m.archiveVisible}
      transparent
      animationType={reduced ? 'none' : 'fade'}
      onRequestClose={m.dismissArchive}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: '#0008',
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer la confirmation"
          disabled={busy}
          onPress={m.dismissArchive}
          style={{ flex: 1 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            width: '100%',
            maxWidth: 700,
            alignSelf: 'center',
            backgroundColor: theme.surface,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            maxHeight: '90%',
            overflow: 'hidden',
          }}
        >
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{
              padding: 24,
              paddingBottom: Math.max(insets.bottom, 20),
              gap: 18,
            }}
          >
            <Icon
              name={{ ios: 'archivebox', android: 'archive' }}
              size={28}
              color={theme.text}
            />
            <Copy
              accessibilityRole="header"
              style={{ fontSize: 24, fontWeight: '600' }}
            >
              Archiver {habit.name} ?
            </Copy>
            <Copy style={{ fontSize: 15, lineHeight: 22 }}>
              Cette habitude disparaîtra de votre suivi quotidien. Vos saisies
              restent conservées.
            </Copy>
            <Copy style={{ fontSize: 13, color: theme.secondary }}>
              La restauration n’est pas encore disponible.
            </Copy>
            <View
              style={{
                padding: 14,
                borderRadius: 12,
                backgroundColor: theme.selected,
                gap: 5,
              }}
            >
              <Copy style={{ fontSize: 16, fontWeight: '600' }}>
                {habit.name}
              </Copy>
              <Copy
                style={{
                  fontSize: 14,
                  color: categoryColor(habit.category, theme.dark).ink,
                }}
              >
                {categories[habit.category]} ·{' '}
                {amount(habit.target, habit.unit)}{' '}
                {habit.period === 'weekly' ? 'par semaine' : 'par jour'}
              </Copy>
            </View>
            {!!m.error && (
              <Copy
                accessibilityRole="alert"
                style={{ fontSize: 14, color: theme.error }}
              >
                {m.error}
              </Copy>
            )}
            <Button
              variant="primary"
              tone="danger"
              disabled={busy}
              onPress={m.archive}
              onFeedbackEnd={(outcome) => {
                if (outcome === 'success') m.finishArchive()
              }}
            >
              Archiver l’habitude
            </Button>
            <Button disabled={busy} onPress={m.dismissArchive}>
              Garder mon habitude
            </Button>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
