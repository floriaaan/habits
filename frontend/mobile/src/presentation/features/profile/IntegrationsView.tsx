import { router } from 'expo-router'
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { errorMessage } from '../../../domain/api-error'
import type { Integration } from '../../../domain/models'
import { FormInput, FormScrollView } from '../../shared/forms/FormScrollView'
import { KeyboardScreen } from '../../shared/forms/KeyboardScreen'
import { Button, Copy, Icon, useTheme } from '../../shared/ui/native-ui'
import type { IntegrationsController } from './useIntegrationsController'

const services = [
  {
    provider: 'strava',
    name: 'Strava',
    logo: require('./assets/strava.png'),
    description:
      'Associez vos activités à vos habitudes et lancez leur synchronisation.',
  },
  {
    provider: 'home_assistant',
    name: 'Home Assistant',
    logo: require('./assets/home-assistant.png'),
    description: 'Reliez vos habitudes à votre maison connectée.',
  },
] as const

export function IntegrationsView({ model }: { model: IntegrationsController }) {
  const theme = useTheme(),
    insets = useSafeAreaInsets()
  const service = services.find((item) => item.provider === model.selected)
  const connected = (provider: Integration['provider']) =>
    model.query.data?.find(
      (item) => item.provider === provider && item.connected,
    )
  const integration = service && connected(service.provider)
  const ready = model.allowed && !!model.query.data && !model.query.isError
  return (
    <KeyboardScreen style={{ backgroundColor: theme.surface }}>
      <View style={[s.header, { backgroundColor: theme.surface }]}>
        {service && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Revenir aux intégrations"
            disabled={model.busy}
            onPress={() => model.select(null)}
            style={s.iconButton}
          >
            <Icon
              name={{ ios: 'chevron.left', android: 'arrow_back' }}
              color={theme.text}
              size={22}
            />
          </Pressable>
        )}
        <Copy accessibilityRole="header" style={s.title}>
          {service?.name ?? 'Intégrations'}
        </Copy>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer les intégrations"
          onPress={() => router.back()}
          style={[
            s.iconButton,
            { backgroundColor: theme.selected, borderRadius: 24 },
          ]}
        >
          <Icon
            name={{ ios: 'xmark', android: 'close' }}
            color={theme.secondary}
            size={19}
          />
        </Pressable>
      </View>
      <FormScrollView
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          padding: 22,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 22),
          gap: 16,
        }}
      >
        <Copy style={{ color: theme.secondary, fontSize: 15, lineHeight: 22 }}>
          {service?.description ?? 'Vos services, au même endroit.'}
        </Copy>
        {model.demo && (
          <Copy style={{ color: theme.secondary, fontSize: 13 }}>
            Mode démo · connexions simulées
          </Copy>
        )}
        {!model.allowed ? (
          <Copy accessibilityRole="alert">
            Votre accès ne permet pas de gérer les intégrations.
          </Copy>
        ) : model.query.isError ? (
          <>
            <Copy accessibilityRole="alert" style={{ color: theme.error }}>
              {errorMessage(model.query.error)}
            </Copy>
            <Button onPress={() => model.query.refetch()}>Réessayer</Button>
          </>
        ) : !model.query.data ? (
          <ActivityIndicator
            color={theme.secondary}
            accessibilityLabel="Chargement des intégrations"
          />
        ) : service ? (
          <>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <Image source={service.logo} accessible={false} style={s.logo} />
              <Copy
                style={{
                  color: integration ? theme.success : theme.secondary,
                  fontSize: 15,
                }}
              >
                {integration ? 'Connecté' : 'À connecter'}
              </Copy>
            </View>
            {!integration && service.provider === 'home_assistant' && (
              <>
                <Copy
                  style={{
                    color: theme.secondary,
                    fontSize: 14,
                    lineHeight: 21,
                  }}
                >
                  Saisissez un jeton d’accès longue durée de Home Assistant.
                  L’adresse de l’instance est configurée sur votre serveur
                  Habits.
                </Copy>
                <FormInput
                  accessibilityLabel="Jeton d’accès Home Assistant"
                  placeholder="Jeton d’accès"
                  placeholderTextColor={theme.secondary}
                  value={model.token}
                  onChangeText={model.setToken}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  editable={!model.busy}
                  style={[
                    s.input,
                    { color: theme.text, borderColor: theme.secondary },
                  ]}
                />
              </>
            )}
            {!integration && (
              <Button
                disabled={
                  !ready ||
                  model.busy ||
                  (service.provider === 'home_assistant' && !model.token.trim())
                }
                onPress={
                  service.provider === 'strava'
                    ? model.connectStrava
                    : model.connectHomeAssistant
                }
              >
                {`Connecter ${service.name}`}
              </Button>
            )}
            {integration && service.provider === 'strava' && (
              <Button disabled={model.busy} onPress={model.syncStrava}>
                Synchroniser les activités
              </Button>
            )}
            {integration && (
              <Button
                tone="danger"
                disabled={model.busy}
                onPress={() => model.disconnect(integration)}
              >
                {`Déconnecter ${service.name}`}
              </Button>
            )}
          </>
        ) : (
          <View>
            {services.map((item, index) => {
              const active = !!connected(item.provider)
              return (
                <Pressable
                  key={item.provider}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${active ? 'connecté' : 'à connecter'}`}
                  onPress={() => model.select(item.provider)}
                  style={({ pressed }) => [
                    s.service,
                    {
                      opacity: pressed ? 0.6 : 1,
                      borderBottomColor: theme.selected,
                      borderBottomWidth:
                        index === 0 ? StyleSheet.hairlineWidth : 0,
                    },
                  ]}
                >
                  <Image source={item.logo} accessible={false} style={s.logo} />
                  <View style={{ flex: 1, gap: 5 }}>
                    <Copy style={{ fontSize: 17, fontWeight: '600' }}>
                      {item.name}
                    </Copy>
                    <Copy
                      style={{
                        fontSize: 14,
                        color: active ? theme.success : theme.secondary,
                      }}
                    >
                      {active ? 'Connecté' : 'À connecter'}
                    </Copy>
                  </View>
                  <Icon
                    name={{ ios: 'chevron.right', android: 'chevron_right' }}
                    color={theme.secondary}
                    size={17}
                  />
                </Pressable>
              )
            })}
            <Copy
              style={{
                color: theme.secondary,
                fontSize: 13,
                lineHeight: 20,
                marginTop: 16,
              }}
            >
              Choisissez un service pour le connecter ou gérer ses réglages.
            </Copy>
          </View>
        )}
        {!!model.error && (
          <Copy
            accessibilityRole="alert"
            style={{ color: theme.error, fontSize: 14 }}
          >
            {model.error}
          </Copy>
        )}
        {!!model.notice && (
          <Copy
            accessibilityLiveRegion="polite"
            style={{ color: theme.secondary, fontSize: 14 }}
          >
            {model.notice}
          </Copy>
        )}
      </FormScrollView>
    </KeyboardScreen>
  )
}
const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: { flex: 1, fontSize: 22, fontWeight: '600', letterSpacing: -0.3 },
  iconButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  service: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 88,
    paddingVertical: 18,
  },
  logo: { width: 40, height: 40, resizeMode: 'contain', borderRadius: 9 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 48,
    padding: 12,
    fontSize: 17,
  },
})
