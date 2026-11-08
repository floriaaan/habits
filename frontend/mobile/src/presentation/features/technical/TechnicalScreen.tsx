import { useState } from 'react'
import { Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useApp } from '../../../application/providers'
import { errorMessage } from '../../../domain/api-error'
import { FormScrollView } from '../../shared/forms/FormScrollView'
import { KeyboardScreen } from '../../shared/forms/KeyboardScreen'
import { AuthenticatedTools } from './AuthenticatedTools'
import { Button, Field, Section } from './technical-ui'
import { styles } from './technical.styles'
export function TechnicalScreen() {
  const { runtime, session, status, error, signIn, signOut, restore, epoch } =
    useApp()
  const [pat, setPat] = useState(''),
    [localError, setLocalError] = useState('')
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardScreen style={styles.safe}>
        <FormScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.page}
        >
          <Text accessibilityRole="header" style={styles.title}>
            Habits
          </Text>
          <Text style={styles.description}>
            Console mobile ·{' '}
            {runtime.fake
              ? 'FAKE — données et intégrations simulées'
              : runtime.config.origin}
          </Text>
          <Section title="Connexion">
            {session && status === 'authenticated' ? (
              <>
                <Text selectable style={styles.text}>
                  {session.user_id}
                </Text>
                <Text style={styles.description}>
                  {session.mode} · {session.scopes.join(', ')}
                </Text>
                <Button
                  label="Se déconnecter"
                  onPress={() => {
                    void signOut().catch((e) => setLocalError(errorMessage(e)))
                  }}
                />
              </>
            ) : (
              <>
                {!runtime.fake && (
                  <Field
                    label="Token personnel"
                    value={pat}
                    onChange={setPat}
                    secret
                  />
                )}
                <Button
                  label={
                    status === 'restoring'
                      ? 'Vérification…'
                      : runtime.fake
                        ? 'Ouvrir la démonstration'
                        : 'Se connecter avec le token'
                  }
                  disabled={
                    status === 'restoring' || (!runtime.fake && !pat.trim())
                  }
                  onPress={() => {
                    const token = pat
                    setPat('')
                    void signIn(runtime.fake ? '' : token)
                  }}
                />
                {!runtime.fake && runtime.oidc.enabled && (
                  <Button
                    label="Se connecter avec OIDC"
                    disabled={status === 'restoring'}
                    onPress={() => {
                      setPat('')
                      void signIn()
                    }}
                  />
                )}
                {status === 'unavailable' && (
                  <Button
                    label="Réessayer la vérification"
                    onPress={() => {
                      void restore()
                    }}
                  />
                )}
              </>
            )}
            {!!(error || localError) && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error || localError}
              </Text>
            )}
          </Section>
          {session && status === 'authenticated' && (
            <AuthenticatedTools key={`${session.user_id}:${epoch}`} />
          )}
        </FormScrollView>
      </KeyboardScreen>
    </SafeAreaView>
  )
}
