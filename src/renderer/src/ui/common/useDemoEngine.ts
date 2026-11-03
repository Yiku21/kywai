import { useSyncExternalStore } from 'react'
import { demoEngine } from '@/demo/engine'

// Instantáneas primitivas: estables aunque getState() devuelva un objeto nuevo en cada llamada.
const subscribe = (cb: () => void): (() => void) => demoEngine.subscribe(cb)
const getRunning = (): boolean => demoEngine.getState().running
const getLabel = (): string => demoEngine.getState().label

export function useDemoRunning(): boolean {
  return useSyncExternalStore(subscribe, getRunning, () => false)
}

export function useDemoLabel(): string {
  return useSyncExternalStore(subscribe, getLabel, () => '')
}
