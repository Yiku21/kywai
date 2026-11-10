// «Responder» bajo la respuesta de un agente: tu mensaje va directo a ese mismo agente con su respuesta citada, para
// que la revise o la continúe. Lo usan el motor (sendMessage) y los cuadros de texto (la cita de encima). Órbita
// manda el id de la respuesta y el motor hace el resto.

/** Lo que se cita de la respuesta al agente: suficiente para que sepa de qué hablas sin llenar su contexto. */
const QUOTE_MAX = 6000

/** El principio de la respuesta en una línea, para la cita del chat y del cuadro de texto. */
export function replyExcerpt(text: string, max = 90): string {
  const flat = text
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/[#>*_`|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/** Sin nada escrito, «Responder» le pide que revise su respuesta. */
export const DEFAULT_REPLY_ASK = 'Revisa tu respuesta: comprueba que es correcta y completa, corrige lo que haga falta y dame la versión buena.'

/**
 * El encargo que recibe el agente: su respuesta citada y lo que le pides ahora. Si la respuesta es muy larga se cita
 * el final (donde suele estar la conclusión) y se avisa de que está recortada.
 */
export function replyRequest(answer: string, ask: string): string {
  const body = answer.trim()
  const quoted = body.length > QUOTE_MAX ? `[…recortada: este es el final de tu respuesta…]\n${body.slice(-QUOTE_MAX)}` : body
  return [
    'El usuario responde a esta respuesta tuya anterior en el chat:',
    '<<<RESPUESTA',
    quoted,
    'RESPUESTA>>>',
    '',
    `Lo que te pide ahora: ${ask.trim() || DEFAULT_REPLY_ASK}`
  ].join('\n')
}
