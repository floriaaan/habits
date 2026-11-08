import { Modal, Pressable, ScrollView, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { useDeviceInsets } from '../../shared/layout/DeviceInsets'
import { amount } from '../../shared/models/home-model'
import { Button, Copy, Icon, useTheme } from '../../shared/ui/native-ui'
import type { EditEntryController } from './useEditEntryController'

export function DeleteEntrySheet({ model: m }: { model: EditEntryController }) {
  const theme = useTheme(),
    insets = useDeviceInsets(),
    reduced = useReducedMotion()
  const { entry, habit } = m.snapshot
  return (
    <Modal
      visible={m.confirmation}
      transparent
      animationType={reduced ? 'none' : 'fade'}
      onRequestClose={m.dismissConfirmation}
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
          disabled={!!m.work}
          onPress={m.dismissConfirmation}
          style={{ flex: 1 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: '90%',
            backgroundColor: theme.surface,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            overflow: 'hidden',
            width: '100%',
            maxWidth: 700,
            alignSelf: 'center',
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
              name={{ ios: 'trash', android: 'delete' }}
              size={28}
              color={theme.error}
            />
            <Copy
              accessibilityRole="header"
              style={{ fontSize: 24, fontWeight: '600' }}
            >
              Supprimer cette saisie ?
            </Copy>
            <Copy style={{ fontSize: 15, lineHeight: 22 }}>
              Elle ne comptera plus dans votre suivi. Votre progression et vos
              XP seront recalculés.
            </Copy>
            <Copy style={{ fontSize: 14, fontWeight: '600' }}>
              {habit.name} · {amount(entry.value, habit.unit)}
            </Copy>
            <Copy style={{ fontSize: 13, color: theme.secondary }}>
              {new Date(entry.occurred_at).toLocaleString('fr-FR', {
                timeZone: habit.timezone,
              })}
            </Copy>
            {!!m.error && (
              <Copy accessibilityRole="alert" style={{ color: theme.error }}>
                {m.error}
              </Copy>
            )}
            <Button
              variant="primary"
              tone="danger"
              disabled={!!m.work || !m.canWrite}
              onPress={m.remove}
              onFeedbackEnd={(outcome) => {
                if (outcome === 'success') m.finish()
              }}
            >
              Supprimer la saisie
            </Button>
            <Button disabled={!!m.work} onPress={m.dismissConfirmation}>
              Garder la saisie
            </Button>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
