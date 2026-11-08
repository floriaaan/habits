import { RollingValuesProvider } from '../shared/ui/RollingValue'
import { Tabs, usePathname } from 'expo-router'
import { NativeTabs } from 'expo-router/native-tabs'
import { Platform } from 'react-native'
import { useApp } from '../../application/providers'
import { usePrepareNativeTabMotion } from '../shared/motion/TabCardMotion'
import { useTheme } from '../shared/ui/native-ui'

export default function TabsLayout() {
  const { status, session, epoch } = useApp()
  return (
    <RollingValuesProvider key={`${status}:${session?.user_id}:${epoch}`}>
      <TabNavigation />
    </RollingValuesProvider>
  )
}
function TabNavigation() {
  const { status } = useApp(),
    prepare = usePrepareNativeTabMotion(),
    path = usePathname(),
    theme = useTheme()
  if (Platform.OS !== 'ios')
    return (
      <Tabs
        screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="today" />
        <Tabs.Screen name="progress" />
        <Tabs.Screen name="profile" />
      </Tabs>
    )
  return (
    <NativeTabs
      hidden={status !== 'authenticated'}
      minimizeBehavior="never"
      iconColor={theme.text}
      tintColor={theme.text}
    >
      <NativeTabs.Trigger
        name="index"
        disableAutomaticContentInsets
        listeners={{ tabPress: () => prepare('/', path) }}
      >
        <NativeTabs.Trigger.Icon sf="square.stack.3d.up.fill" />
        <NativeTabs.Trigger.Label>Accueil</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="today"
        disableAutomaticContentInsets
        listeners={{ tabPress: () => prepare('/today', path) }}
      >
        <NativeTabs.Trigger.Icon sf="calendar" />
        <NativeTabs.Trigger.Label>Aujourd’hui</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="progress"
        disableAutomaticContentInsets
        listeners={{ tabPress: () => prepare('/progress', path) }}
      >
        <NativeTabs.Trigger.Icon sf="chart.bar.xaxis" />
        <NativeTabs.Trigger.Label>Progression</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="profile"
        disableAutomaticContentInsets
        listeners={{ tabPress: () => prepare('/profile', path) }}
      >
        <NativeTabs.Trigger.Icon sf="person.fill" />
        <NativeTabs.Trigger.Label>Profil</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
