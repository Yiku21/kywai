import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/theme-orbita.css'
import './styles/themes.css'
import './styles/motion.css'
import { App } from './App'
import { ChatPaneApp } from './ui/pane/ChatPaneApp'
import { boundChat } from './lib/chatPane'
import { applyTheme, storedTheme } from './lib/theme'
import { applyLang } from './lib/i18n'
import { useCowork } from './store/cowork'
import { startDialogMotion } from './lib/dialogMotion'

// Acceso de depuración en desarrollo.
if (import.meta.env.DEV) (window as unknown as { __cowork: typeof useCowork }).__cowork = useCowork

// El tema de este dispositivo, antes de pintar nada (sin parpadeo).
applyTheme(storedTheme())
// El idioma de este dispositivo (atributo lang de la página).
applyLang()
// Las ventanas se van con suavidad (las entradas las hace styles/motion.css).
startDialogMotion()

// Un archivo soltado fuera del chat no hace nada: si no, la ventana se iría a ese archivo
// (en el escritorio se quedaba en negro y en el navegador salía de kywai).
const isFileDrag = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files')
window.addEventListener('dragover', (e) => {
  if (!isFileDrag(e) || e.defaultPrevented) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
})
window.addEventListener('drop', (e) => {
  if (isFileDrag(e)) e.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ?chatProject=…&chatConversation=…: solo ese chat (el de al lado o una ventana suelta). */}
    {boundChat ? <ChatPaneApp /> : <App />}
  </StrictMode>
)
