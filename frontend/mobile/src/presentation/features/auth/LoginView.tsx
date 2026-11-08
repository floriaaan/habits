import { FormLabel } from '../../shared/forms/FormLabel'
import {
  MotionCard,
  usePrepareNativeTabMotion,
  useTabMotionScroll,
} from '../../shared/motion/TabCardMotion'
import { SocialProviderIcon } from './SocialProviderIcon'
import { router } from 'expo-router'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { FormInput, FormScrollView } from '../../shared/forms/FormScrollView'
import { KeyboardScreen } from '../../shared/forms/KeyboardScreen'
import { useDeviceInsets } from '../../shared/layout/DeviceInsets'
import { deviceCornerRadius } from '../../shared/layout/geometry'
import { Button, Copy, Icon, useTheme } from '../../shared/ui/native-ui'
import type { LoginController, LoginMode } from './useLoginController'

const titles: Record<LoginMode, string> = {
  login: 'Ravi de vous retrouver.',
  register: 'Votre rythme commence ici.',
  forgot: 'Un nouveau départ.',
  reset: 'Un nouveau mot de passe.',
  advanced: 'Autres moyens de connexion.',
}
const subtitles: Record<LoginMode, string> = {
  login: 'Connectez-vous pour retrouver vos habitudes.',
  register: 'Créez votre compte Habits.',
  forgot: 'Nous vous enverrons un code pour récupérer votre compte.',
  reset: 'Saisissez le code reçu et choisissez votre nouveau mot de passe.',
  advanced: 'Connectez-vous avec votre fournisseur ou un jeton personnel.',
}
const actions: Record<LoginMode, string> = {
  login: 'Se connecter',
  register: 'Créer mon compte',
  forgot: 'Envoyer le code',
  reset: 'Modifier le mot de passe',
  advanced: 'Utiliser le jeton',
}
export function LoginView({ model: m }: { model: LoginController }) {
  const theme = useTheme(),
    insets = useDeviceInsets(),
    { width } = useWindowDimensions()
  const prepare = usePrepareNativeTabMotion()
  const motionScroll = useTabMotionScroll('/login')
  const passwordShown = ['login', 'register', 'reset'].includes(m.mode)
  const codeShown = m.mode === 'reset'
  const error = m.localError || (m.feedback === 'error' ? m.error : '')
  const ink = { color: theme.text }
  function link(label: string, action: () => void, subtle = false) {
    return (
      <Pressable
        accessibilityRole="button"
        disabled={m.busy}
        onPress={action}
        style={{
          minHeight: 44,
          justifyContent: 'center',
          opacity: m.busy ? 0.45 : 1,
        }}
      >
        <Copy
          style={{
            textAlign: 'center',
            fontSize: 14,
            color: subtle ? theme.secondary : theme.text,
          }}
        >
          {label}
        </Copy>
      </Pressable>
    )
  }
  return (
    <KeyboardScreen style={{ backgroundColor: theme.canvas }}>
      <FormScrollView
        onScroll={motionScroll}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={s.page}
      >
        <MotionCard
          screen="/login"
          role="primary"
          style={[
            s.main,
            {
              backgroundColor: theme.surface,
              paddingTop: insets.top + 12,
              borderTopLeftRadius: deviceCornerRadius(insets.top, width),
              borderTopRightRadius: deviceCornerRadius(insets.top, width),
            },
          ]}
        >
          <View style={s.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retour"
              disabled={m.busy}
              onPress={() => {
                if (m.mode !== 'login') m.changeMode('login')
                else {
                  prepare('/', '/login')
                  if (router.canGoBack()) router.back()
                  else router.replace('/')
                }
              }}
              style={s.back}
            >
              <Icon
                name={{ ios: 'chevron.left', android: 'arrow_back' }}
                size={21}
                color={theme.text}
              />
            </Pressable>
            <Copy style={[s.brand, ink]}>Habits</Copy>
          </View>
          <View style={s.intro}>
            <Copy accessibilityRole="header" style={[s.title, ink]}>
              {titles[m.mode]}
            </Copy>
            <Copy
              style={{ color: theme.secondary, fontSize: 15, lineHeight: 22 }}
            >
              {subtitles[m.mode]}
            </Copy>
          </View>
          <View style={s.formBottom}>
            <View style={s.fields}>
              {m.mode !== 'advanced' && (
                <View style={s.field}>
                  <FormLabel
                    label="Adresse e-mail"
                    icon="email"
                    style={[s.label, ink]}
                  />
                  <FormInput
                    accessibilityLabel="Adresse e-mail"
                    value={m.email}
                    onChangeText={m.setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    editable={!m.busy}
                    placeholder="vous@exemple.fr"
                    placeholderTextColor={theme.secondary}
                    style={[
                      s.input,
                      {
                        color: theme.text,
                        backgroundColor: theme.chip,
                        borderColor: theme.selected,
                      },
                    ]}
                  />
                </View>
              )}
              {codeShown && (
                <View style={s.field}>
                  <FormLabel
                    label="Code de vérification"
                    icon="code"
                    style={[s.label, ink]}
                  />
                  <FormInput
                    accessibilityLabel="Code de vérification à 8 chiffres"
                    value={m.code}
                    onChangeText={(value) =>
                      m.setCode(value.replace(/\D/g, '').slice(0, 8))
                    }
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={8}
                    editable={!m.busy}
                    placeholder="00000000"
                    placeholderTextColor={theme.secondary}
                    style={[
                      s.input,
                      {
                        color: theme.text,
                        backgroundColor: theme.chip,
                        borderColor: theme.selected,
                      },
                    ]}
                  />
                </View>
              )}
              {passwordShown && (
                <View style={s.field}>
                  <FormLabel
                    icon="password"
                    style={[s.label, ink]}
                    label={
                      m.mode === 'reset'
                        ? 'Nouveau mot de passe'
                        : 'Mot de passe'
                    }
                  />
                  <View
                    style={[
                      s.password,
                      {
                        backgroundColor: theme.chip,
                        borderColor: theme.selected,
                      },
                    ]}
                  >
                    <FormInput
                      accessibilityLabel="Mot de passe"
                      value={m.password}
                      onChangeText={m.setPassword}
                      secureTextEntry={!m.visible}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete={
                        m.mode === 'login' ? 'current-password' : 'new-password'
                      }
                      textContentType={
                        m.mode === 'login' ? 'password' : 'newPassword'
                      }
                      editable={!m.busy}
                      returnKeyType="go"
                      onSubmitEditing={() => void m.submit()}
                      style={[s.passwordInput, ink]}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        m.visible
                          ? 'Masquer le mot de passe'
                          : 'Afficher le mot de passe'
                      }
                      onPress={() => m.setVisible(!m.visible)}
                      style={s.back}
                    >
                      <Icon
                        name={{
                          ios: m.visible ? 'eye.slash' : 'eye',
                          android: m.visible ? 'visibility_off' : 'visibility',
                        }}
                        size={19}
                        color={theme.secondary}
                      />
                    </Pressable>
                  </View>
                  {m.mode !== 'login' && (
                    <Copy style={{ color: theme.secondary, fontSize: 13 }}>
                      12 caractères minimum.
                    </Copy>
                  )}
                </View>
              )}
              {m.mode === 'advanced' && (
                <>
                  <Copy style={{ color: theme.secondary, fontSize: 13 }}>
                    {m.origin}
                  </Copy>
                  {m.oidcEnabled && (
                    <Button onPress={() => m.submit('oidc')} disabled={m.busy}>
                      Continuer avec mon fournisseur
                    </Button>
                  )}
                  <FormLabel
                    label="Jeton personnel"
                    icon="key"
                    style={s.label}
                  />
                  <FormInput
                    accessibilityLabel="Jeton personnel"
                    value={m.pat}
                    onChangeText={m.setPat}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    editable={!m.busy}
                    style={[
                      s.input,
                      {
                        color: theme.text,
                        backgroundColor: theme.chip,
                        borderColor: theme.selected,
                      },
                    ]}
                  />
                </>
              )}
            </View>
            {['login', 'register'].includes(m.mode) && (
              <View style={s.socialSection}>
                <View style={s.separator}>
                  <View
                    accessible={false}
                    style={[
                      s.separatorLine,
                      { backgroundColor: theme.selected },
                    ]}
                  />
                  <Copy style={{ color: theme.secondary, fontSize: 13 }}>
                    Ou
                  </Copy>
                  <View
                    accessible={false}
                    style={[
                      s.separatorLine,
                      { backgroundColor: theme.selected },
                    ]}
                  />
                </View>
                <View style={s.socialRow}>
                  {['Apple', 'Google'].map((provider) => (
                    <Pressable
                      key={provider}
                      disabled
                      accessibilityRole="button"
                      accessibilityLabel={provider}
                      accessibilityState={{ disabled: true }}
                      style={[s.social, { borderColor: theme.selected }]}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <SocialProviderIcon
                          provider={provider === 'Apple' ? 'apple' : 'google'}
                          color={theme.secondary}
                        />
                        <Copy
                          style={{
                            color: theme.secondary,
                            fontSize: 15,
                            fontWeight: '500',
                          }}
                        >
                          {provider}
                        </Copy>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            {m.mode === 'login' &&
              link('Mot de passe oublié ?', () => m.changeMode('forgot'), true)}
            {m.status === 'unavailable' && (
              <Button disabled={m.busy} onPress={() => m.restore()}>
                Réessayer ma connexion
              </Button>
            )}
            {!!m.notice && (
              <Copy
                accessibilityLiveRegion="polite"
                style={{ color: theme.secondary, fontSize: 14, lineHeight: 20 }}
              >
                {m.notice}
              </Copy>
            )}
            {!!error && (
              <Copy
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={{ color: theme.error, fontSize: 14, lineHeight: 20 }}
              >
                {error}
              </Copy>
            )}
          </View>
        </MotionCard>
        <MotionCard
          screen="/login"
          role="auth-footer"
          colors={theme.green}
          style={[
            s.footer,
            {
              backgroundColor: theme.green[1],
              paddingBottom: Math.max(16, insets.bottom),
              borderBottomLeftRadius: deviceCornerRadius(
                insets.bottom + 24,
                width,
              ),
              borderBottomRightRadius: deviceCornerRadius(
                insets.bottom + 24,
                width,
              ),
            },
          ]}
        >
          <Button
            variant="primary"
            disabled={m.busy || (m.mode === 'advanced' && !m.pat.trim())}
            feedback={m.feedback}
            onFeedbackEnd={m.finishConnect}
            onPress={() => m.submit()}
          >
            {actions[m.mode]}
          </Button>
          {m.mode === 'login' ? (
            <>
              {link('Pas encore de compte ? Créer un compte', () =>
                m.changeMode('register'),
              )}
              {link(
                'Autres moyens de connexion',
                () => m.changeMode('advanced'),
                true,
              )}
            </>
          ) : (
            link('Revenir à la connexion', () => m.changeMode('login'))
          )}
        </MotionCard>
      </FormScrollView>
    </KeyboardScreen>
  )
}
const s = StyleSheet.create({
  page: {
    flexGrow: 1,
    gap: 6,
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
    paddingHorizontal: 6,
  },
  main: {
    flexGrow: 1,
    padding: 22,
    gap: 18,
    borderRadius: 28,
    paddingBottom: 24,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brand: { fontSize: 18, fontWeight: '600' },
  intro: { gap: 10, marginTop: 8, marginBottom: 2 },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  formBottom: { marginTop: 'auto', gap: 18 },
  separator: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  separatorLine: { flex: 1, height: StyleSheet.hairlineWidth },
  fields: { gap: 12 },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  password: {
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
  },
  passwordInput: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  socialSection: { gap: 12 },
  socialRow: { flexDirection: 'row', gap: 10 },
  social: {
    flex: 1,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
  },
  footer: { padding: 20, borderRadius: 28, gap: 2 },
})
