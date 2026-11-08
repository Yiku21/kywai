import type { ThemeId } from '@/lib/theme'

/** Small, static silhouettes: no extra WebGL canvases in the theme picker. */
export function WorldPreview({ id }: { id: ThemeId }) {
  const colors: Partial<Record<ThemeId, string>> = { clasico: '#6bd5ff', orbita: '#a3dfff', marfil: '#467c68', grafito: '#e4ac53', bosque: '#88c379', matrix: '#4cff94', eva: '#b2eb58', relicario: '#dbbc7c', telar: '#bdc9e7', halloween: '#ffa34f', navidad: '#d4deb9', kywai: '#76c7b8', submarino: '#64eaff' }
  const color = colors[id]
  if (!color) return null
  return <svg viewBox="0 0 120 84" width="100%" height="100%" aria-hidden="true" fill="none" stroke={color} strokeWidth="1.4">
    {id === 'submarino' && <><path d="M25 53Q5 17 33 22Q60 0 87 22Q115 17 95 53L60 70Z M60 65 32 24 M60 65 45 17 M60 65V15 M60 65 76 17 M60 65 89 24"/><circle cx="60" cy="53" r="10"/><path d="M8 65q10-20 0-35 M108 65q-10-20 0-35"/></>}
    {id === 'kywai' && <><path d="M8 65V42a52 36 0 0 1 104 0v23 M10 41h100 M60 6v35 M30 11Q15 36 22 61 M90 11q15 25 8 50" /><ellipse cx="60" cy="65" rx="27" ry="9" /><path d="M60 62V40m0 10-10-9m10 3 10-9" /><ellipse cx="60" cy="34" rx="18" ry="11" /></>}
    {id === 'clasico' && <>
      {[8, 91].map(x => <g key={x}><rect x={x} y="17" width="20" height="43" rx="2" />{[24, 32, 40, 48].map(y => <path key={y} d={`M${x + 4} ${y}h12`} />)}</g>)}
      <path d="M60 16 79 37 60 57 41 37Z M41 37h38 M60 16v41 M24 70h72 M35 66v-6 M85 66v-6" />
    </>}
    {id === 'orbita' && <>
      <circle cx="60" cy="35" r="15" /><ellipse cx="60" cy="35" rx="28" ry="8" transform="rotate(-25 60 35)" />
      <path d="M7 23h15v17H7z M98 18h15v17H98z M14 23v17 M105 18v17 M22 31h11 M88 26h10" />
      {[26, 87].map(x => <g key={x}><ellipse cx={x} cy="65" rx="17" ry="6" /><path d={`M${x - 17} 65v5q17 12 34 0v-5`} /></g>)}
      <path d="M34 12h2 M83 9h2 M8 56h2 M108 52h2" />
    </>}
    {id === 'marfil' && <>
      {[12, 44, 76].map(x => <path key={x} d={`M${x} 49V26a12 12 0 0 1 24 0v23 M${x - 3} 49h6 M${x + 21} 49h6`} />)}
      <ellipse cx="60" cy="64" rx="31" ry="9" /><ellipse cx="60" cy="44" rx="13" ry="18" transform="rotate(35 60 44)" /><path d="M60 62v-6 M9 78l15-21 M111 78 96 57" />
    </>}
    {id === 'grafito' && <>
      <path d="M7 68V19h16v27h9 M97 69V24h14 M8 29h14 M98 36h13" />
      <ellipse cx="61" cy="22" rx="17" ry="6" /><ellipse cx="61" cy="57" rx="17" ry="6" /><path d="M44 22v35 M78 22v35 M54 25v29 M68 25v29" />
      <ellipse cx="61" cy="70" rx="30" ry="8" /><path d="M31 67l-6 3 7 6 M91 67l6 3-7 6" />
    </>}
    {id === 'bosque' && <>
      <path d="M59 57V27 M59 43 42 30 M60 37l16-12 M55 58l-8 5 M63 58l9 5" />
      <path fill="#386446" d="M31 29Q24 13 42 12Q53-1 65 11Q84 4 89 22Q99 39 78 41Q63 50 54 38Q37 44 31 29Z" />
      <path d="M59 57V31 M59 44 45 36 M59 41l15-8" />
      <ellipse cx="60" cy="65" rx="25" ry="7" /><ellipse cx="20" cy="72" rx="12" ry="5" /><ellipse cx="103" cy="66" rx="12" ry="5" />
    </>}
    {id === 'matrix' && <>
      {[12, 28, 92, 108].map((x, i) => <g key={x} opacity=".6">{[12, 24, 36, 48, 60].map(y => <path key={y} d={(y + i) % 3 ? `M${x + 2} ${y}v6` : `M${x} ${y}h4v6h-4Z`} />)}</g>)}
      <path d="M60 18 80 30v26L60 68 40 56V30Z M40 30l20 12 20-12 M60 42v26 M50 24l20 12v26 M40 43l20 12 20-12" />
    </>}
    {id === 'relicario' && <><path d="M9 63V29Q15 11 26 8Q37 11 43 29V63 M77 63V29Q83 11 94 8Q105 11 111 29V63 M60 25 73 45 60 68 47 45Z M47 45h26 M60 25v43" /><ellipse cx="60" cy="70" rx="28" ry="6" /></>}
    {id === 'telar' && <><path d="M60 5v74 M7 42h106 M23 10l74 64 M97 10 23 74 M13 22l94 40 M13 62l94-40" />{[13,25,37].map(r=><ellipse key={r} cx="60" cy="42" rx={r*1.3} ry={r} />)}<circle cx="60" cy="42" r="5" /></>}
    {id === 'halloween' && <><path d="M14 69V29h17V13l8 16v40 M89 69V29h17V13l8 16v40 M31 36 60 17 89 36 M48 70V48q12-20 24 0v22" /><circle cx="60" cy="33" r="8" /><ellipse cx="21" cy="73" rx="12" ry="8" /><ellipse cx="99" cy="73" rx="12" ry="8" /></>}
    {id === 'navidad' && <><path d="M5 44 24 26 43 44v25H5Z M77 44l19-18 19 18v25H77Z M17 49h12v14H17Z M90 49h12v14H90Z M60 23 47 43h7L43 57h34L66 43h7Z" /><circle cx="60" cy="42" r="26" /><ellipse cx="60" cy="72" rx="30" ry="6" /><path d="m60 9 2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1Z" /></>}
    {id === 'eva' && <>
      <path d="M10 69V15h23v8H20v46 M110 69V15H87v8h13v46 M26 12h68 M29 7l7 5 M44 7l7 5 M59 7l7 5 M74 7l7 5 M89 7l7 5" />
      <rect x="48" y="22" width="24" height="43" rx="12" /><path d="M43 29v30 M77 29v30 M46 29h28 M46 57h28 M30 73h60" />
    </>}
  </svg>
}
