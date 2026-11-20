// Iconos propios y símbolos de productos (Simple Icons, CC0).
const paths = {
  user:'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-2a8 8 0 0 1 16 0v2',
  search:'M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
  monitor:'M3 4h18v13H3zM8 21h8M12 17v4',
  phone:'M7 2h10v20H7zM10 18h4',
  globe:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  cloud:'M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5 5 0 0 1 0 11H6',
  cpu:'M6 6h12v12H6zM9 9h6v6H9zM9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4',
  terminal:'m5 7 5 5-5 5m8 0h6',
  expand:'M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5',
  message:'M3 4h18v13H8l-5 4V4',
  check:'m5 12 4 4L19 6M21 12a9 9 0 1 1-6-8',
  file:'M6 2h8l4 4v16H6V2m8 0v5h4M9 12h6m-6 4h6',
  code:'m8 6-5 6 5 6m8-12 5 6-5 6m-3-14-2 16',
  arrow:'M4 12h16m-6-6 6 6-6 6',

  team:'M4 6h6v6H4zM14 6h6v6h-6zM9 18h6M7 12v3h10v-3M12 15v3',
  video:'M4 5h16v14H4zM10 9l5 3-5 3V9',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',
  folder:'M3 7V5h7l2 2h9v12H3V7',
  plug:'M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0V8m6 9v4',
  sliders:'M5 3v18M12 3v18M19 3v18M2 8h6m1 8h6m1-10h6',
}
export function icon(key) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[key] || paths.plug}"/></svg>` }

const BRAND_FILES={GitHub:'github',Perplexity:'perplexity',PostHog:'posthog',Gmail:'gmail',Notion:'notion','Google Drive':'googledrive','Google Calendar':'googlecalendar',Claude:'claude',Gemini:'googlegemini',Ollama:'ollama',Cursor:'cursor','GitHub Copilot CLI':'github'}
export function brandSymbol(name,base,fallback='plug') {
 const file=BRAND_FILES[name]
 return file?`<img class="brand-symbol" src="${base}assets/marcas/${file}.svg" alt="" width="26" height="26" loading="lazy">`:icon(fallback)
}
