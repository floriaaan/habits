import {
  usePrepareCardResize,
  usePrepareNativeTabMotion,
} from '../../shared/motion/TabCardMotion'
import { useRef, useState } from 'react'
import { useApp } from '../../../application/providers'
import { ApiError, errorMessage } from '../../../domain/api-error'

export type LoginMode = 'login' | 'register' | 'forgot' | 'reset' | 'advanced'
export function useLoginController() {
  const { runtime, status, error, signIn, restore } = useApp()
  const prepareResize = usePrepareCardResize('/login')
  const prepareNavigation = usePrepareNativeTabMotion()
  const [mode, setMode] = useState<LoginMode>('login')
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('')
  const [code, setCode] = useState(''),
    [pat, setPat] = useState('')
  const [visible, setVisible] = useState(false)
  const [localError, setLocalError] = useState(''),
    [notice, setNotice] = useState('')
  const [pendingMethod, setPendingMethod] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<
    'idle' | 'pending' | 'success' | 'error'
  >('idle')
  const sending = useRef(false)
  const busy = status === 'restoring' || pendingMethod !== null
  function changeMode(next: LoginMode) {
    if (busy || next === mode) return
    prepareResize()
    setLocalError('')
    setNotice('')
    setCode('')
    setPassword('')
    setPat('')
    setVisible(false)
    setMode(next)
  }
  async function submit(method: LoginMode | 'oidc' = mode) {
    if (sending.current || busy) return false
    setLocalError('')
    setNotice('')
    const address = email.trim().toLowerCase()
    if (
      !['advanced', 'oidc'].includes(method) &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)
    ) {
      setLocalError('Saisissez une adresse e-mail valide.')
      return false
    }
    if (['register', 'reset'].includes(method) && [...password].length < 12) {
      setLocalError('Choisissez un mot de passe de 12 caractères minimum.')
      return false
    }
    if (method === 'reset' && !/^\d{8}$/.test(code.trim())) {
      setLocalError('Saisissez le code à 8 chiffres reçu par e-mail.')
      return false
    }
    sending.current = true
    setPendingMethod(method)
    setFeedback('pending')
    try {
      let result = true
      if (method === 'oidc') result = await signIn()
      else if (method === 'advanced')
        result = await signIn(runtime.fake ? '' : pat.trim())
      else if (method === 'login')
        result = await signIn(undefined, { email: address, password })
      else if (method === 'register') {
        await runtime.accounts.register(
          address,
          password,
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        )
        setPassword('')
        prepareResize()
        setMode('login')
        setNotice('Compte créé. Vous pouvez vous connecter.')
      } else if (method === 'forgot') {
        await runtime.accounts.forgot(address)
        prepareResize()
        setMode('reset')
        setNotice(
          'Si un compte utilise cette adresse, un code de récupération a été envoyé.',
        )
      } else if (method === 'reset') {
        await runtime.accounts.reset(address, code.trim(), password)
        setPassword('')
        setCode('')
        prepareResize()
        setMode('login')
        setNotice('Mot de passe modifié. Reconnectez-vous.')
      }
      setFeedback(result ? 'success' : 'error')
      if (result && ['login', 'oidc', 'advanced'].includes(method)) {
        setPassword('')
        setPat('')
      }
      return result
    } catch (e) {
      setLocalError(
        e instanceof ApiError && e.status === 404
          ? 'La connexion par e-mail n’est pas activée sur cette instance.'
          : errorMessage(e),
      )
      setFeedback('error')
      return false
    } finally {
      sending.current = false
    }
  }
  return {
    mode,
    changeMode,
    email,
    setEmail,
    password,
    setPassword,
    code,
    setCode,
    visible,
    setVisible,
    notice,
    feedback,
    pendingMethod,
    finishConnect: () => {
      if (status === 'authenticated') prepareNavigation('/', '/login')
      setPendingMethod(null)
      setFeedback('idle')
    },
    isDemo: !!runtime.fake,
    oidcEnabled: runtime.oidc.enabled,
    origin: runtime.config.origin,
    status,
    error,
    restore,
    pat,
    setPat,
    localError,
    busy,
    submit,
  }
}
export type LoginController = ReturnType<typeof useLoginController>
