import { Redirect } from 'expo-router'

// AuthSession validates state and exchanges the code. Routing must never consume,
// display, persist, or log callback parameters, including on a cold launch.
export default function OAuthCallback() {
  return <Redirect href="/" />
}
