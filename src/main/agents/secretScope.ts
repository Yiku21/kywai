// Puente entre los secretos del proyecto (projectSecrets.ts, que necesita Electron para descifrar) y el lanzamiento
// de los agentes: las variables que recibe el programa de una tarea y la función que tapa sus valores en lo que
// devuelve. Sin Electron, para que las pruebas lo usen tal cual.
import { AsyncLocalStorage } from 'node:async_hooks'

/** Las variables de entorno secretas del encargo en curso (solo dentro de runAgent con `secrets`). */
export const secretScope = new AsyncLocalStorage<Record<string, string>>()

let redactor: (text: string) => string = (text) => text

/** La app la conecta al arrancar con ProjectSecrets.redact. */
export function setSecretRedactor(fn: (text: string) => string): void {
  redactor = fn
}

/** Tapa los valores secretos de un texto. */
export function redactSecrets(text: string): string {
  if (!text) return text
  try {
    return redactor(text)
  } catch {
    return text
  }
}

/** Las variables secretas del encargo en curso (vacío fuera de un encargo). */
export function currentSecretEnv(): Record<string, string> {
  return secretScope.getStore() ?? {}
}

let provider: (projectId: string) => Record<string, string> = () => ({})

/** La app la conecta al arrancar con ProjectSecrets.env. */
export function setSecretEnvProvider(fn: (projectId: string) => Record<string, string>): void {
  provider = fn
}

/** Las variables secretas de un proyecto (vacío si no tiene o no se pueden descifrar). */
export function secretEnvFor(projectId: string): Record<string, string> {
  try {
    return provider(projectId)
  } catch {
    return {}
  }
}
