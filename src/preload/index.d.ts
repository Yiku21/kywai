import type { CoworkApi } from '../shared/types'

declare global {
  interface Window {
    cowork?: CoworkApi
  }
}

export {}
