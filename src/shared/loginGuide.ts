// Pasos para iniciar sesión en cada agente, explicados para alguien que nunca ha usado una terminal. Los usan la
// ventana de terminal que abre «Iniciar sesión» (src/main/loginScript.ts los escribe arriba, antes de la orden del
// agente) y el asistente (SetupWizard.tsx los enseña debajo del agente). Así quien conecta un agente lee lo mismo en
// los dos sitios.
import { t } from './i18n'
import type { SetupToolId } from './types'

export type LoginPlatform = 'win' | 'mac' | 'linux'

/** El sistema de un proceso de Node («win32», «darwin», «linux»…). */
export function platformOf(nodePlatform: string): LoginPlatform {
  return nodePlatform === 'win32' ? 'win' : nodePlatform === 'darwin' ? 'mac' : 'linux'
}

/** El sistema de este navegador o ventana (la interfaz no tiene process). */
export function browserPlatform(): LoginPlatform {
  const ua = typeof navigator !== 'undefined' ? `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}` : ''
  if (/Win/i.test(ua)) return 'win'
  if (/Mac/i.test(ua)) return 'mac'
  return 'linux'
}

/** Cómo se pega en una ventana de terminal de cada sistema. */
export function pasteHint(p: LoginPlatform): string {
  if (p === 'win') return t('clic derecho (o Ctrl + V)')
  if (p === 'mac') return t('⌘ Comando + V')
  return t('Ctrl + Mayús + V (o clic derecho → Pegar)')
}

/** Los pasos de inicio de sesión de un agente, en orden y en frases cortas. */
export function loginSteps(id: SetupToolId, label: string, p: LoginPlatform): string[] {
  const paste = pasteHint(p)
  switch (id) {
    case 'claude':
      return [
        t('Se abrirá tu navegador con la página de Claude. Entra con tu cuenta (la de tu suscripción Pro o Max) y pulsa «Autorizar».'),
        t('Si la página te enseña un código, cópialo, vuelve a esta ventana, pégalo con {paste} y pulsa Intro.', { paste }),
        t('Cuando aquí ponga que has iniciado sesión, vuelve a kywai.')
      ]
    case 'codex':
      return [
        t('Se abrirá tu navegador. Entra con tu cuenta de ChatGPT y acepta.'),
        t('Cuando el navegador diga que ya puedes cerrarlo, vuelve a kywai.')
      ]
    case 'gemini':
      return [
        t('Lo más fácil y gratis: pega en kywai, junto a Gemini, una clave de Google AI Studio (aistudio.google.com/apikey) y cierra la ventana de la terminal.'),
        t('Si prefieres hacerlo aquí: Gemini te preguntará cómo entrar. Muévete con las flechas ↑ ↓, elige «Use Gemini API Key», pulsa Intro y pega la clave con {paste}.', { paste }),
        t('Cuando veas el recuadro para escribir, ya está: escribe /quit, pulsa Intro y vuelve a kywai.')
      ]
    case 'hermes':
      return [
        t('Hermes te hará unas preguntas para elegir el servicio que piensa por él (el proveedor). Muévete con las flechas ↑ ↓ y pulsa Intro para elegir.'),
        t('Si no pagas ninguna suscripción, elige OpenRouter y pega con {paste} tu clave gratis de openrouter.ai/keys.', { paste }),
        t('Para lo demás, pulsa Intro y se queda lo que viene puesto. Al terminar, vuelve a kywai.')
      ]
    case 'muse':
      return [
        t('Si te pregunta cómo entrar, elige iniciar sesión con el navegador (muévete con las flechas ↑ ↓ y pulsa Intro).'),
        t('Entra con tu cuenta en el navegador y acepta.'),
        t('Cuando veas el recuadro para escribir, ya está: escribe /quit, pulsa Intro y vuelve a kywai.')
      ]
    default:
      return [
        t('{label} te dirá qué hacer. Casi siempre se abre el navegador para que entres con tu cuenta y aceptes.', { label }),
        t('Si te pide elegir algo, muévete con las flechas ↑ ↓ y pulsa Intro. Si te pide un código o una clave, pégalo con {paste} y pulsa Intro.', { paste }),
        t('Cuando termine, vuelve a kywai: comprueba solo si quedó conectado.')
      ]
  }
}

/**
 * El primer paso de una «otra cuenta» (src/shared/accounts.ts): entrar con la otra, no con la que el navegador tenga
 * abierta. Va delante de los pasos de su programa en la ventana y en kywai.
 */
export function accountLoginStep(provider: string): string {
  const site = provider === 'claude' ? 'claude.ai' : provider === 'codex' ? 'chatgpt.com' : 'Google'
  return t('Entra con la OTRA cuenta, no con la de siempre. Si el navegador entra solo con la de siempre, cierra sesión en {site} (o copia el enlace en una ventana privada) y vuelve a intentarlo.', { site })
}

/** Los pasos de un agente; en una «otra cuenta» (account:<id>), los de su programa con el aviso delante. */
export function loginStepsOf(id: SetupToolId, agent: { provider: string } | undefined, label: string, p: LoginPlatform): string[] {
  if (id.startsWith('account:') && agent) return [accountLoginStep(agent.provider), ...loginSteps(agent.provider as SetupToolId, label, p)]
  return loginSteps(id, label, p)
}
