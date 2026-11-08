import { TabCardMotionProvider } from '../presentation/shared/motion/TabCardMotion'
import { NavigationBar } from 'expo-navigation-bar'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Providers } from '../application/providers'
import { errorMessage } from '../domain/api-error'
import { DeviceInsetsProvider } from '../presentation/shared/layout/DeviceInsets'
import { HabitMorphProvider } from '../presentation/shared/motion/HabitMorph'
import { useTheme } from '../presentation/shared/ui/native-ui'
import { LaunchSplash } from '../presentation/shell/LaunchSplash'
import { createRuntime } from './create-runtime'
void SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const theme = useTheme()
  const [state] = useState(() => {
    try {
      return { runtime: createRuntime() }
    } catch (error) {
      return { error: errorMessage(error) }
    }
  })
  if (!state.runtime)
    return (
      <View
        onLayout={() => {
          void SplashScreen.hideAsync().catch(() => {})
        }}
        style={{ padding: 32, paddingTop: 80 }}
      >
        <Text accessibilityRole="alert">{state.error}</Text>
      </View>
    )
  return (
    <SafeAreaProvider>
      <LaunchSplash>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <NavigationBar style={theme.dark ? 'dark' : 'light'} />
        <Providers runtime={state.runtime}>
          <DeviceInsetsProvider>
            <TabCardMotionProvider>
              <HabitMorphProvider>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    scrollEdgeEffects: {
                      top: 'hidden',
                      bottom: 'hidden',
                      left: 'hidden',
                      right: 'hidden',
                    },
                    autoHideHomeIndicator: false,
                    contentStyle: { backgroundColor: theme.surface },
                    headerStyle: { backgroundColor: theme.surface },
                    headerTintColor: theme.text,
                  }}
                >
                  <Stack.Screen
                    name="login"
                    options={{ headerShown: true, title: 'Connexion' }}
                  />
                  <Stack.Screen
                    name="console"
                    options={{ headerShown: true, title: 'Outils avancés' }}
                  />
                  <Stack.Screen
                    name="habit/[id]"
                    options={{
                      headerShown: false,
                      presentation: 'card',
                      animation: 'none',
                      title: 'Habitude',
                    }}
                  />
                  <Stack.Screen
                    name="new"
                    options={{ headerShown: false, presentation: 'modal' }}
                  />
                  <Stack.Screen
                    name="integrations"
                    options={{
                      presentation: 'formSheet',
                      sheetAllowedDetents: [0.5, 0.85],
                      sheetGrabberVisible: true,
                      sheetCornerRadius: 30,
                      sheetExpandsWhenScrolledToEdge: true,
                    }}
                  />
                </Stack>
              </HabitMorphProvider>
            </TabCardMotionProvider>
          </DeviceInsetsProvider>
        </Providers>
      </LaunchSplash>
    </SafeAreaProvider>
  )
}
