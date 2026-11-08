import { createContext, useContext } from 'react'

// The app is mounted behind the launch modal; entrances must wait until it clears.
export const MotionVisibility = createContext(true)
export function useMotionVisible() {
  return useContext(MotionVisibility)
}
