import { useEffect, useRef, useState } from 'react'
import { Alert } from 'react-native'
import {
  appearanceLabels,
  type AppearancePreference,
} from '../../../application/appearance'
import { useDashboardQuery } from '../../../application/habit-queries'
import { useApp } from '../../../application/providers'
import { useInvalidate } from '../../../application/queries'
import { errorMessage } from '../../../domain/api-error'

export function useProfileController() {
  const {
    runtime,
    session,
    signOut,
    appearance,
    appearanceBusy,
    changeAppearance,
  } = useApp()
  const invalidate = useInvalidate()
  const allowed =
    !!session?.scopes.includes('statistics:read') &&
    !!session?.scopes.includes('habits:read')
  const progress = useDashboardQuery(allowed)
  const [working, setWorking] = useState(false),
    locked = useRef(false)
  const [feedback, setFeedback] = useState<'idle' | 'success' | 'error'>('idle')
  useEffect(() => {
    if (feedback === 'idle') return
    const timer = setTimeout(() => setFeedback('idle'), 850)
    return () => clearTimeout(timer)
  }, [feedback])
  async function perform(action: () => Promise<unknown>) {
    if (locked.current) return
    locked.current = true
    setWorking(true)
    setFeedback('idle')
    try {
      await action()
      setFeedback('success')
    } catch (error) {
      setFeedback('error')
      Alert.alert('Profil', errorMessage(error))
    } finally {
      locked.current = false
      setWorking(false)
    }
  }
  function chooseAppearance() {
    Alert.alert(
      'Apparence',
      'Choisissez le thème de l’application.',
      (Object.keys(appearanceLabels) as AppearancePreference[]).map(
        (value) => ({
          text:
            appearanceLabels[value] + (appearance === value ? ' (actuel)' : ''),
          onPress: () => {
            void changeAppearance(value).catch((error) =>
              Alert.alert('Apparence', errorMessage(error)),
            )
          },
        }),
      ),
      { cancelable: true },
    )
  }
  function connection() {
    const mode =
      session!.mode === 'oidc_access_token'
        ? 'Connexion via votre fournisseur d’identité'
        : session!.mode === 'service_account'
          ? 'Compte de service'
          : 'Jeton d’accès personnel'
    Alert.alert(
      'Connexion',
      runtime.fake
        ? 'Démonstration locale. Les données sont simulées en mémoire et ne sont pas envoyées au serveur.'
        : `${runtime.config.origin}\n\n${mode}\nCompte : ${session!.user_id}\n\nDroits : ${session!.scopes.join(', ')}`,
    )
  }
  function resetDemo() {
    Alert.alert(
      'Réinitialiser la démonstration ?',
      'Vos modifications de démonstration seront effacées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: () => {
            void perform(async () => {
              runtime.fake!.reset()
              await invalidate([
                'habits',
                'entries',
                'dashboard',
                'statistics',
                'gamification',
              ])
            })
          },
        },
      ],
    )
  }
  return {
    isDemo: !!runtime.fake,
    accountLabel: runtime.fake
      ? 'Compte démo'
      : session!.mode === 'service_account'
        ? 'Compte de service'
        : 'Compte personnel',
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
  }
}
export type ProfileController = ReturnType<typeof useProfileController>
