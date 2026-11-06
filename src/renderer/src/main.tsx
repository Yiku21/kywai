import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/theme-orbita.css'
import './styles/themes.css'
import { App } from './App'
import { applyTheme, storedTheme } from './lib/theme'
import { applyLang } from './lib/i18n'
import { useCowork } from './store/cowork'

// Acceso de depuración en desarrollo.
if (import.meta.env.DEV) (window as unknown as { __cowork: typeof useCowork }).__cowork = useCowork

// El tema de este dispositivo, antes de pintar nada (sin parpadeo).
applyTheme(storedTheme())
// El idioma de este dispositivo (atributo lang de la página).
applyLang()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
