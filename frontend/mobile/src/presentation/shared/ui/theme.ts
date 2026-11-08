import { useColorScheme } from 'react-native'

export function useTheme() {
  const dark = useColorScheme() === 'dark'
  return {
    dark,
    canvas: '#0c1011',
    surface: dark ? '#242627' : '#f8f8f8',
    chip: dark ? '#303334' : '#ffffff',
    text: dark ? '#f7f8f8' : '#101213',
    secondary: dark ? '#bdc4c6' : '#606466',
    selected: dark ? '#464a4b' : '#e7e7e7',
    pink: dark
      ? (['#593846', '#714050'] as const)
      : (['#ffe7ed', '#f9c4d6'] as const),
    green: dark
      ? (['#354630', '#415a32'] as const)
      : (['#eefadc', '#e0f2c9'] as const),
    blue: dark
      ? (['#25475d', '#295572'] as const)
      : (['#deefff', '#cce7ff'] as const),
    onPastel: dark ? '#f9faf7' : '#121612',
    pinkText: dark ? '#f4dbe4' : '#795460',
    greenText: dark ? '#d3e7c5' : '#576c47',
    blueText: dark ? '#d3eafa' : '#315e7b',
    accent: dark ? '#a3d55c' : '#458d0c',
    success: dark ? '#c6ecb0' : '#2d6410',
    successSurface: dark ? '#284321' : '#e5f3da',
    errorSurface: dark ? '#522a2b' : '#fde7e6',
    error: dark ? '#ffb4ab' : '#a6292e',
  }
}
