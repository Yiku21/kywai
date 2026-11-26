// Página «Actualizaciones»: todos los cambios de kywai desde el primer día (los datos salen de actualizaciones.json, que pone
// al día sincronizar-actualizaciones.mjs). Los textos de la página y los hitos van en los 6 idiomas; los cambios anteriores
// al 20 nov 2026 solo existen en español y salen así (con lang="es") en los demás idiomas.
import { readFileSync } from 'node:fs'

const DATOS = JSON.parse(readFileSync(new URL('./actualizaciones.json', import.meta.url), 'utf8')).dias

export const ACTUALIZACIONES = {
  es: {
    title: 'Todo lo que ha cambiado en kywai.', lede: 'Cada mejora, desde el primer día hasta hoy. De la más nueva a la más antigua.',
    stats: ['cambios', 'días con novedades', 'desde'], filters: ['Todo', 'Destacado', 'Mejoras', 'Arreglos'], search: 'Buscar un cambio…', searchLabel: 'Buscar en las actualizaciones',
    none: 'Ningún cambio coincide con tu búsqueda.', milestones: 'Los hitos', history: 'Historial completo', jump: 'Ir a', fix: 'Arreglo', cloud: 'Solo en kywai Cloud', device: 'Solo en tu equipo',
    old: 'Los cambios anteriores al 20 de noviembre de 2026 están solo en español.', more: 'Notas de cada versión en GitHub',
  },
  en: {
    title: 'Everything that has changed in kywai.', lede: 'Every improvement, from day one until today. Newest first.',
    stats: ['changes', 'days with news', 'since'], filters: ['All', 'Highlights', 'Improvements', 'Fixes'], search: 'Search for a change…', searchLabel: 'Search the updates',
    none: 'No change matches your search.', milestones: 'Milestones', history: 'Full history', jump: 'Jump to', fix: 'Fix', cloud: 'kywai Cloud only', device: 'Your computer only',
    old: 'Changes before 20 November 2026 are only available in Spanish.', more: 'Release notes for each version on GitHub',
  },
  pt: {
    title: 'Tudo o que mudou no kywai.', lede: 'Cada melhoria, desde o primeiro dia até hoje. Da mais nova à mais antiga.',
    stats: ['mudanças', 'dias com novidades', 'desde'], filters: ['Tudo', 'Destaques', 'Melhorias', 'Correções'], search: 'Procurar uma mudança…', searchLabel: 'Procurar nas atualizações',
    none: 'Nenhuma mudança corresponde à sua busca.', milestones: 'Marcos', history: 'Histórico completo', jump: 'Ir para', fix: 'Correção', cloud: 'Só no kywai Cloud', device: 'Só no seu computador',
    old: 'As mudanças anteriores a 20 de novembro de 2026 estão apenas em espanhol.', more: 'Notas de cada versão no GitHub',
  },
  fr: {
    title: 'Tout ce qui a changé dans kywai.', lede: 'Chaque amélioration, du premier jour à aujourd’hui. De la plus récente à la plus ancienne.',
    stats: ['changements', 'jours avec des nouveautés', 'depuis'], filters: ['Tout', 'À la une', 'Améliorations', 'Corrections'], search: 'Chercher un changement…', searchLabel: 'Chercher dans les mises à jour',
    none: 'Aucun changement ne correspond à votre recherche.', milestones: 'Étapes clés', history: 'Historique complet', jump: 'Aller à', fix: 'Correction', cloud: 'Seulement dans kywai Cloud', device: 'Seulement sur votre ordinateur',
    old: 'Les changements antérieurs au 20 novembre 2026 sont uniquement en espagnol.', more: 'Notes de chaque version sur GitHub',
  },
  zh: {
    title: 'kywai 的所有变化。', lede: '从第一天到今天的每一项改进，由新到旧。',
    stats: ['项更新', '个有更新的日子', '起始于'], filters: ['全部', '重点', '改进', '修复'], search: '搜索某项更新…', searchLabel: '搜索更新记录',
    none: '没有符合搜索条件的更新。', milestones: '重要节点', history: '完整历史', jump: '跳到', fix: '修复', cloud: '仅限 kywai Cloud', device: '仅限你的电脑',
    old: '2026 年 11 月 20 日之前的更新仅提供西班牙语。', more: 'GitHub 上每个版本的说明',
  },
  hi: {
    title: 'kywai में जो कुछ भी बदला है।', lede: 'पहले दिन से आज तक का हर सुधार, नए से पुराने के क्रम में।',
    stats: ['बदलाव', 'नई चीज़ों वाले दिन', 'शुरुआत'], filters: ['सब', 'ख़ास', 'सुधार', 'फ़िक्स'], search: 'कोई बदलाव खोजें…', searchLabel: 'अपडेट में खोजें',
    none: 'आपकी खोज से कोई बदलाव मेल नहीं खाता।', milestones: 'अहम पड़ाव', history: 'पूरा इतिहास', jump: 'यहाँ जाएँ', fix: 'फ़िक्स', cloud: 'सिर्फ़ kywai Cloud में', device: 'सिर्फ़ आपके कंप्यूटर पर',
    old: '20 नवंबर 2026 से पहले के बदलाव केवल स्पैनिश में हैं।', more: 'GitHub पर हर संस्करण के नोट्स',
  },
}

// Fecha ISO → los hitos de kywai (lo que cambió la historia del producto), con sus textos en los 6 idiomas.
const HITOS = [
  ['2026-10-10', { es: 'Primera versión: un equipo de agentes coordinado por Hermes en un espacio 3D', en: 'First version: a team of agents coordinated by Hermes in a 3D space', pt: 'Primeira versão: uma equipa de agentes coordenada pelo Hermes num espaço 3D', fr: 'Première version : une équipe d’agents coordonnée par Hermes dans un espace 3D', zh: '第一个版本：由 Hermes 协调的智能体团队，身处 3D 空间', hi: 'पहला संस्करण: 3D स्पेस में Hermes द्वारा संचालित एजेंटों की टीम' }],
  ['2026-10-11', { es: 'Órbita: la app de Android con chat, voz y mundo 3D', en: 'Órbita: the Android app with chat, voice and the 3D world', pt: 'Órbita: o app de Android com chat, voz e mundo 3D', fr: 'Órbita : l’app Android avec chat, voix et monde 3D', zh: 'Órbita：带聊天、语音和 3D 世界的 Android 应用', hi: 'Órbita: चैट, आवाज़ और 3D दुनिया वाला Android ऐप' }],
  ['2026-10-12', { es: 'Catálogo de agentes, app cliente y temas 3D', en: 'Agent catalogue, client app and 3D themes', pt: 'Catálogo de agentes, app cliente e temas 3D', fr: 'Catalogue d’agents, app cliente et thèmes 3D', zh: '智能体目录、客户端应用和 3D 主题', hi: 'एजेंट कैटलॉग, क्लाइंट ऐप और 3D थीम' }],
  ['2026-10-13', { es: 'Revisión por otro agente, «Te necesita» y rutinas', en: 'Review by another agent, “Needs you” and routines', pt: 'Revisão por outro agente, «Precisa de ti» e rotinas', fr: 'Relecture par un autre agent, « Il a besoin de toi » et routines', zh: '由另一个智能体复核、“需要你”提醒和例行任务', hi: 'दूसरे एजेंट से समीक्षा, “आपकी ज़रूरत है” और रूटीन' }],
  ['2026-11-03', { es: 'Primera versión pública en GitHub', en: 'First public version on GitHub', pt: 'Primeira versão pública no GitHub', fr: 'Première version publique sur GitHub', zh: 'GitHub 上的第一个公开版本', hi: 'GitHub पर पहला सार्वजनिक संस्करण' }],
  ['2026-11-06', { es: 'Linux, cinco idiomas y 3D más ligero', en: 'Linux, five languages and a lighter 3D', pt: 'Linux, cinco idiomas e 3D mais leve', fr: 'Linux, cinq langues et une 3D plus légère', zh: 'Linux、五种语言和更轻的 3D', hi: 'Linux, पाँच भाषाएँ और हल्का 3D' }],
  ['2026-11-07', { es: 'Descargas con actualización sola, extensiones y nombre kywai', en: 'Downloads that update themselves, extensions and the name kywai', pt: 'Downloads com atualização automática, extensões e o nome kywai', fr: 'Téléchargements à mise à jour automatique, extensions et le nom kywai', zh: '可自动更新的下载、扩展，以及 kywai 这个名字', hi: 'खुद अपडेट होने वाले डाउनलोड, एक्सटेंशन और kywai नाम' }],
  ['2026-11-09', { es: 'Estudio de vídeo: «/video» y solo llega el MP4', en: 'Video studio: “/video” and only the MP4 reaches you', pt: 'Estúdio de vídeo: «/video» e só chega o MP4', fr: 'Studio vidéo : « /video » et seul le MP4 vous parvient', zh: '视频工作室：“/video”，你只会收到 MP4', hi: 'वीडियो स्टूडियो: “/video” और आप तक सिर्फ़ MP4 पहुँचता है' }],
  ['2026-11-10', { es: 'Instagram y TikTok propios, /serie, /aprende y conversaciones en paralelo', en: 'Your own Instagram and TikTok, /series, /learn and parallel conversations', pt: 'Instagram e TikTok próprios, /serie, /aprende e conversas em paralelo', fr: 'Instagram et TikTok à vous, /serie, /aprende et conversations en parallèle', zh: '自己的 Instagram 和 TikTok、/serie、/aprende 以及并行对话', hi: 'अपने Instagram और TikTok, /serie, /aprende और समानांतर बातचीत' }],
  ['2026-11-12', { es: 'Personajes de los agentes, Tablero, /consejo, /radar y dos chats a la vez', en: 'Agent characters, the Board, /council, /radar and two chats at once', pt: 'Personagens dos agentes, Quadro, /consejo, /radar e dois chats ao mesmo tempo', fr: 'Personnages des agents, Tableau, /consejo, /radar et deux chats à la fois', zh: '智能体角色、看板、/consejo、/radar 以及同时两个聊天', hi: 'एजेंटों के किरदार, बोर्ड, /consejo, /radar और एक साथ दो चैट' }],
  ['2026-11-13', { es: 'Navegador incorporado para los agentes', en: 'A built-in browser for the agents', pt: 'Navegador incorporado para os agentes', fr: 'Un navigateur intégré pour les agents', zh: '为智能体内置的浏览器', hi: 'एजेंटों के लिए बिल्ट-इन ब्राउज़र' }],
  ['2026-11-23', { es: 'kywai 1.0', en: 'kywai 1.0', pt: 'kywai 1.0', fr: 'kywai 1.0', zh: 'kywai 1.0', hi: 'kywai 1.0' }],
  ['2026-11-24', { es: 'kywai 1.28: peluches para tus agentes, «Tu ordenador», la máquina de reels y los conectores', en: 'kywai 1.28: plush looks for your agents, “Your computer”, the reels machine and connectors', pt: 'kywai 1.28: peluches para os teus agentes, «O teu computador», a máquina de reels e os conectores', fr: 'kywai 1.28 : des peluches pour vos agents, « Votre ordinateur », la machine à reels et les connecteurs', zh: 'kywai 1.28：智能体毛绒造型、“你的电脑”、短视频工厂和连接器', hi: 'kywai 1.28: एजेंटों के लिए प्लश लुक, “आपका कंप्यूटर”, रील मशीन और कनेक्टर' }],
  ['2026-11-25', { es: 'Pagos reales con Stripe en kywai Cloud', en: 'Real payments with Stripe in kywai Cloud', pt: 'Pagamentos reais com Stripe no kywai Cloud', fr: 'Paiements réels avec Stripe dans kywai Cloud', zh: 'kywai Cloud 支持 Stripe 真实支付', hi: 'kywai Cloud में Stripe से असली भुगतान' }],
  ['2026-11-25', { es: 'kywai 1.35: ventanas a tu medida, pulsar para hablar, música con ytm-rs y letras, amigos que suenan y «/diseno» y «/juego»', en: 'kywai 1.35: resizable windows, push-to-talk, music with ytm-rs and lyrics, friends that chime, and “/design” and “/game”', pt: 'kywai 1.35: janelas à tua medida, premir para falar, música com ytm-rs e letras, amigos que soam e «/diseno» e «/juego»', fr: 'kywai 1.35 : fenêtres sur mesure, appuyer pour parler, musique avec ytm-rs et paroles, amis qui sonnent, « /diseno » et « /juego »', zh: 'kywai 1.35：可调窗口、按住说话、ytm-rs 音乐与歌词、好友提示音，以及“/diseno”和“/juego”', hi: 'kywai 1.35: मनचाहे आकार की विंडो, दबाकर बोलें, ytm-rs संगीत और गीत, बजने वाले दोस्त, और “/diseno” व “/juego”' }],
]

const MESES_NOMBRE = (lang, fecha) => new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(fecha + '-01T00:00:00Z'))
const DIA_NOMBRE = (lang, fecha) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(fecha + 'T00:00:00Z'))

/** La página entera: cifras, hitos, filtros y todos los días. */
export function renderActualizaciones({ a, lang, esc, releases, base }) {
  const total = DATOS.reduce((suma, d) => suma + d.n.length, 0)
  const primero = DATOS.at(-1).f
  const texto = (obj) => {
    if (!obj) return ''
    const propio = obj[lang]
    if (propio) return esc(propio)
    // Sin traducción: el español, marcado como tal para que los lectores de pantalla lo lean bien.
    return lang === 'es' ? esc(obj.es) : `<span lang="es">${esc(obj.es)}</span>`
  }
  const hitos = HITOS.map(([fecha, t]) => `<li><time datetime="${fecha}">${esc(DIA_NOMBRE(lang, fecha))}</time><span>${esc(t[lang] || t.es)}</span></li>`).join('')
  const meses = [...new Set(DATOS.map(d => d.f.slice(0, 7)))]
  const salto = meses.map(m => `<a href="#mes-${m}">${esc(MESES_NOMBRE(lang, m))}</a>`).join('')
  let abiertos = 0
  const mesesHtml = meses.map(mes => {
    const dias = DATOS.filter(d => d.f.startsWith(mes)).map(d => {
      const abierto = abiertos++ < 2
      const cuenta = d.n.length
      const items = d.n.map(e => {
        const etiqueta = e.so === 'nube' ? `<em class="upd-tag">${esc(a.cloud)}</em>` : e.so === 'equipo' ? `<em class="upd-tag">${esc(a.device)}</em>` : ''
        if (e.t === 'd') return `<li class="upd-card" data-t="d"><h4>${texto(e.ti)}</h4>${e.tx ? `<p>${texto(e.tx)}</p>` : ''}${etiqueta}</li>`
        const version = e.v ? `<code>v${esc(e.v)}</code>` : ''
        return `<li class="upd-line" data-t="${e.t}">${e.t === 'a' ? `<b class="upd-fix">${esc(a.fix)}</b>` : ''}${version}<span>${texto(e.ti)}</span>${etiqueta}</li>`
      }).join('')
      return `<details class="upd-day"${abierto ? ' open' : ''}><summary><time datetime="${d.f}">${esc(DIA_NOMBRE(lang, d.f))}</time><span class="upd-count">${cuenta}</span></summary><ul>${items}</ul></details>`
    }).join('')
    return `<section class="upd-month" id="mes-${mes}"><h3>${esc(MESES_NOMBRE(lang, mes))}</h3>${dias}</section>`
  }).join('')
  const filtros = [['', a.filters[0]], ['d', a.filters[1]], ['m', a.filters[2]], ['a', a.filters[3]]]
    .map(([clave, nombre], i) => `<button type="button" data-filter="${clave}" aria-pressed="${i === 0}">${esc(nombre)}</button>`).join('')
  const aviso = lang === 'es' ? '' : `<p class="upd-old">${esc(a.old)}</p>`
  return `<section class="upd-page" data-upd><div class="wrap">`
    + `<ul class="upd-stats"><li><strong>${total}</strong><span>${esc(a.stats[0])}</span></li><li><strong>${DATOS.length}</strong><span>${esc(a.stats[1])}</span></li><li><strong><time datetime="${primero}">${esc(DIA_NOMBRE(lang, primero))}</time></strong><span>${esc(a.stats[2])}</span></li></ul>`
    + `<h2 class="upd-h">${esc(a.milestones)}</h2><ol class="upd-milestones">${hitos}</ol>`
    + `<h2 class="upd-h">${esc(a.history)}</h2>${aviso}`
    + `<div class="upd-tools"><div class="upd-filters" role="group" aria-label="${esc(a.history)}">${filtros}</div><input type="search" class="upd-search" placeholder="${esc(a.search)}" aria-label="${esc(a.searchLabel)}" autocomplete="off"></div>`
    + `<nav class="upd-jump" aria-label="${esc(a.jump)}"><span>${esc(a.jump)}</span>${salto}</nav>`
    + `<div class="upd-list">${mesesHtml}</div><p class="upd-none" hidden>${esc(a.none)}</p>`
    + `<p class="upd-more"><a class="text-link" href="${releases}">${esc(a.more)} <span aria-hidden="true">→</span></a></p>`
    + `</div></section><script src="${base}assets/actualizaciones.js" defer></script>`
}
