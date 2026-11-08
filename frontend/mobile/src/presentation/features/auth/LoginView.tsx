import { View } from 'react-native'
import { errorMessage } from '../../../domain/api-error'
import { FormInput, FormScrollView } from '../../shared/forms/FormScrollView'
import { KeyboardScreen } from '../../shared/forms/KeyboardScreen'
import { Button, Copy, ui, useTheme } from '../../shared/ui/native-ui'

import type { LoginController } from './useLoginController'
export function LoginView({ model }: { model: LoginController }) {
  const {
    isDemo,
    oidcEnabled,
    status,
    error,
    restore,
    pat,
    setPat,
    localError,
    setLocalError,
    busy,
    connect,
    finishConnect,
    feedback,
    pendingMethod,
  } = model
  const theme = useTheme()
  return (
    <KeyboardScreen style={{ flex: 1, backgroundColor: theme.surface }}>
      <FormScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 22,
          gap: 20,
          maxWidth: 700,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <Copy
          accessibilityRole="header"
          style={{ fontSize: 24, fontWeight: '600' }}
        >
          Ravi de vous retrouver.
        </Copy>
        {isDemo ? (
          <Copy style={{ color: theme.secondary }}>
            Cet environnement utilise des données simulées.
          </Copy>
        ) : (
          <>
            <Copy style={{ color: theme.secondary }}>
              Connectez-vous à votre instance Habits.
            </Copy>
            {oidcEnabled && (
              <Button
                disabled={busy}
                feedback={pendingMethod === 'oidc' ? feedback : 'idle'}
                onFeedbackEnd={finishConnect}
                onPress={() => connect(true)}
              >
                Continuer avec mon compte
              </Button>
            )}
            <View style={{ gap: 8 }}>
              <Copy style={{ fontSize: 15 }}>Jeton personnel</Copy>
              <FormInput
                accessibilityLabel="Jeton personnel"
                value={pat}
                onChangeText={setPat}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={() => {
                  void connect()
                }}
                style={[ui.input, { color: theme.text }]}
              />
            </View>
          </>
        )}
        <Button
          disabled={busy || (!isDemo && !pat.trim())}
          feedback={pendingMethod === 'pat' ? feedback : 'idle'}
          onFeedbackEnd={finishConnect}
          onPress={() => connect()}
        >
          {oidcEnabled && !isDemo ? 'Utiliser le jeton' : 'Se connecter'}
        </Button>
        {status === 'unavailable' && (
          <Button
            onPress={() => {
              return restore().catch((e) => {
                setLocalError(errorMessage(e))
                return false
              })
            }}
          >
            Réessayer la connexion existante
          </Button>
        )}
        {!!(error || localError) && (
          <Copy
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ color: theme.error }}
          >
            {error || localError}
          </Copy>
        )}
      </FormScrollView>
    </KeyboardScreen>
  )
}
