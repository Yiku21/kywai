/**
 * Copia texto al portapapeles. En http sin contexto seguro (el navegador del móvil por Tailscale) no hay
 * navigator.clipboard: se copia con un textarea oculto y execCommand. Lanza un error si no se pudo.
 */
export async function copyText(text: string, failMessage = 'copy failed'): Promise<void> {
  if (window.isSecureContext && navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  ta.setSelectionRange(0, text.length)
  const ok = document.execCommand('copy')
  ta.remove()
  if (!ok) throw new Error(failMessage)
}
