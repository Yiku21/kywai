// Los robots de peluche de kywai (assets/peluche/*.webp): uno por agente, los mismos de la app.
// Se usan en las tarjetas de Funciones, en la fila de Agentes y en la fila final de Precios.
export const PELUCHES = [
  ['hermes', 'Hermes'], ['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini'], ['qwen', 'Qwen'], ['muse', 'Muse'],
  ['becario', 'Becario'], ['aider', 'Aider'], ['amp', 'Amp'], ['antigravity', 'Antigravity'], ['copilot', 'Copilot'],
  ['cursor', 'Cursor'], ['deepseek', 'DeepSeek'], ['goose', 'Goose'], ['grok', 'Grok'], ['kilo', 'Kilo'], ['kimi', 'Kimi'],
  ['local', null], ['mistral', 'Mistral'], ['nvidia', 'NVIDIA'], ['openclaw', 'OpenClaw'], ['openhands', 'OpenHands'],
]
export const TEXTO_PELUCHES = {
  es: { choose: 'Elige quién te acompaña.', local: 'Modelo local', label: 'Agentes de kywai' },
  en: { choose: 'Choose who goes with you.', local: 'Local model', label: 'kywai agents' },
  pt: { choose: 'Escolha quem vai com você.', local: 'Modelo local', label: 'Agentes do kywai' },
  fr: { choose: 'Choisissez qui vous accompagne.', local: 'Modèle local', label: 'Agents de kywai' },
  zh: { choose: '选择与你同行的伙伴。', local: '本地模型', label: 'kywai 智能体' },
  hi: { choose: 'चुनें कि आपके साथ कौन चलेगा।', local: 'लोकल मॉडल', label: 'kywai एजेंट' },
}
export const peluche = (base, id, cls = '', size = 64) => `<img class="rob ${cls}" src="${base}assets/peluche/${id}.webp" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`
export const filaPeluches = (base, lang, esc) => {
  const t = TEXTO_PELUCHES[lang]
  return `<p class="robrow-caption">${esc(t.choose)}</p><ul class="robrow" aria-label="${esc(t.label)}">${PELUCHES.map(([id, name]) => `<li title="${esc(name || t.local)}">${peluche(base, id, '', 84)}</li>`).join('')}</ul>`
}
