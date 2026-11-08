import { router } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { appearanceLabels } from '../../../application/appearance'
import { errorMessage } from '../../../domain/api-error'
import { useDeviceInsets } from '../../shared/layout/DeviceInsets'
import { TabFrame } from '../../shared/layout/TabFrame'
import {
  MotionCard,
  useTabCardNavigation,
  useTabMotionScroll,
} from '../../shared/motion/TabCardMotion'
import {
  Copy,
  deviceCornerRadius,
  Dock,
  dockHeight,
  Icon,
  ScrollViewport,
  useTheme,
} from '../../shared/ui/native-ui'
import { ProfileRow } from './ProfileRow'

import type { ProfileController } from './useProfileController'

export function ProfileView({ model }: { model: ProfileController }) {
  const {
    isDemo,
    accountLabel,
    appearance,
    appearanceBusy,
    allowed,
    progress,
    working,
    feedback,
    chooseAppearance,
    connection,
    resetDemo,
    perform,
    signOut,
  } = model
  const theme = useTheme(),
    insets = useDeviceInsets(),
    { width } = useWindowDimensions()
  const motionScroll = useTabMotionScroll('/profile')
  const navigate = useTabCardNavigation()
  return (
    <TabFrame>
      <ScrollViewport>
        <ScrollView
          onScroll={motionScroll}
          scrollEventThrottle={16}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: 6,
            paddingBottom: dockHeight(insets.bottom) + 6,
            gap: 6,
            flexGrow: 1,
          }}
        >
          <MotionCard
            screen="/profile"
            role="primary"
            style={[
              s.card,
              {
                backgroundColor: theme.surface,
                paddingTop: insets.top + 16,
                borderTopLeftRadius: deviceCornerRadius(insets.top, width),
                borderTopRightRadius: deviceCornerRadius(insets.top, width),
                borderCurve: 'continuous',
              },
            ]}
          >
            <Copy accessibilityRole="header" style={s.title}>
              Profil
            </Copy>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingTop: 18,
              }}
            >
              <View
                accessible={false}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.selected,
                }}
              >
                <Icon
                  name={{ ios: 'person.fill', android: 'person' }}
                  color={theme.secondary}
                  size={28}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Copy style={{ fontSize: 19, fontWeight: '600' }}>
                  {accountLabel}
                </Copy>
                <Copy style={{ color: theme.secondary, fontSize: 14 }}>
                  Votre espace au quotidien
                </Copy>
              </View>
            </View>
          </MotionCard>
          <MotionCard
            screen="/profile"
            role="secondary"
            colors={theme.green}
            style={[s.card, { overflow: 'hidden' }]}
          >
            <Copy
              accessibilityRole="header"
              style={[s.heading, { color: theme.onPastel }]}
            >
              Mon parcours
            </Copy>
            {!allowed ? (
              <Copy
                style={{
                  color: theme.greenText,
                  fontSize: 14,
                  paddingVertical: 16,
                }}
              >
                Votre accès ne permet pas de consulter la progression.
              </Copy>
            ) : progress.error ? (
              <>
                <Copy
                  accessibilityRole="alert"
                  style={{ color: theme.onPastel, fontSize: 14, marginTop: 12 }}
                >
                  {errorMessage(progress.error)}
                </Copy>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => progress.refetch()}
                  style={s.retry}
                >
                  <Copy style={{ color: theme.onPastel }}>Réessayer</Copy>
                </Pressable>
              </>
            ) : !progress.data ? (
              <View style={{ paddingVertical: 18 }}>
                <ActivityIndicator
                  color={theme.greenText}
                  accessibilityLabel="Chargement du parcours"
                />
              </View>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingVertical: 22,
                }}
              >
                <Copy style={[s.metric, { color: theme.onPastel }]}>
                  Niveau {progress.data.gamification.level}
                </Copy>
                <Copy style={[s.metric, { color: theme.onPastel }]}>
                  {progress.data.gamification.xp.toLocaleString('fr-FR')} XP
                </Copy>
              </View>
            )}
            {allowed && (
              <Pressable
                accessibilityRole="button"
                onPress={() => navigate('/progress', '/profile')}
                style={({ pressed }) => ({
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.greenText,
                  minHeight: 48,
                  paddingTop: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Copy style={{ flex: 1, color: theme.onPastel, fontSize: 16 }}>
                  Voir ma progression
                </Copy>
                <Icon
                  name={{ ios: 'chevron.right', android: 'chevron_right' }}
                  color={theme.greenText}
                  size={17}
                />
              </Pressable>
            )}
          </MotionCard>
          <MotionCard
            screen="/profile"
            role="tertiary"
            surfaceOrder={1}
            style={[
              s.card,
              { backgroundColor: theme.surface, paddingVertical: 4 },
            ]}
          >
            <ProfileRow
              icon={{ ios: 'circle.lefthalf.filled', android: 'contrast' }}
              label="Apparence"
              value={appearanceLabels[appearance]}
              feedback={appearanceBusy ? 'pending' : 'idle'}
              disabled={working || appearanceBusy}
              onPress={chooseAppearance}
            />
            <ProfileRow
              icon={{ ios: 'link', android: 'link' }}
              label="Connexion"
              value={isDemo ? 'Démo' : 'Session active'}
              disabled={working}
              onPress={connection}
            />
            <ProfileRow
              icon={{ ios: 'slider.horizontal.3', android: 'tune' }}
              label="Outils avancés"
              disabled={working}
              onPress={() => router.push('/console')}
            />
            <ProfileRow
              icon={
                isDemo
                  ? { ios: 'arrow.counterclockwise', android: 'restart_alt' }
                  : {
                      ios: 'rectangle.portrait.and.arrow.right',
                      android: 'logout',
                    }
              }
              label={isDemo ? 'Réinitialiser la démo' : 'Se déconnecter'}
              feedback={working ? 'pending' : feedback}
              danger
              last
              disabled={working}
              onPress={() => (isDemo ? resetDemo() : void perform(signOut))}
            />
          </MotionCard>
        </ScrollView>
      </ScrollViewport>
      <Dock />
    </TabFrame>
  )
}
const s = StyleSheet.create({
  frame: { flex: 1, width: '100%', maxWidth: 700, alignSelf: 'center' },
  card: { borderRadius: 26, padding: 20 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '600', letterSpacing: -0.3 },
  metric: { fontSize: 21, fontWeight: '500' },
  retry: { minHeight: 48, justifyContent: 'center' },
})
