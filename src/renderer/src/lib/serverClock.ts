// Hora del servidor. Las fechas de las tareas (startedAt, lastActivityAt…) las pone el motor con su reloj. Desde
// el navegador o el cliente de otro equipo, si ese equipo va mal de hora (p. ej. con la zona horaria mal puesta y
// la hora corregida a mano), «ahora − inicio» sale negativo y el reloj de la tarea se queda en 0 s. Aquí se mide
// la diferencia con el servidor y todas las cuentas de tiempo usan serverNow().

let offsetMs = 0

/** «Ahora» en el reloj del servidor (igual que Date.now() en la app de escritorio con su propio motor). */
export function serverNow(): number {
  return Date.now() + offsetMs
}

/** Diferencia actual (servidor − este equipo), en ms. */
export function serverOffset(): number {
  return offsetMs
}

/**
 * Apunta la diferencia a partir de una respuesta del servidor: `serverTs` es su hora al responder y `sentAt` y
 * `receivedAt` las de este equipo al pedir y al recibir. Por debajo de 1 s se toma como 0 (ruido de la red).
 */
export function noteServerTime(serverTs: number, sentAt: number, receivedAt: number): void {
  if (!Number.isFinite(serverTs) || receivedAt < sentAt) return
  const diff = Math.round(serverTs - (sentAt + receivedAt) / 2)
  offsetMs = Math.abs(diff) < 1000 ? 0 : diff
}
