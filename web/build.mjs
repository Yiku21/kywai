// Web estática de kywai: páginas independientes en cinco idiomas, sin dependencias.
// node web/build.mjs [--preview]
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IDIOMAS, TEXTOS } from './textos.mjs'
import { PAGINAS, SECCIONES } from './secciones.mjs'
import { PRECIOS } from './precios.mjs'
import { PRESENTACION } from './presentacion.mjs'
import { ESCAPARATE, renderEscaparate } from './escaparate.mjs'
import { GUIAS, renderGuias } from './guias.mjs'
import { COMPOSIO } from './composio.mjs'
import { VISUALES, renderVisual } from './visuales.mjs'
import { RECORRIDO, renderRecorrido } from './recorrido.mjs'
import { ACTUALIZACIONES, renderActualizaciones } from './actualizaciones.mjs'
const AQUI = dirname(fileURLToPath(import.meta.url))
const PREVIEW = process.argv.includes('--preview')
const SALIDA = join(AQUI, PREVIEW ? 'preview' : 'dist')
const SITIO = 'https://kywai.app/'
const RELEASES = 'https://github.com/Yiku21/kywai/releases/latest'
const RELEASE = JSON.parse(readFileSync(join(AQUI,'descargas.json'),'utf8'))
const composioData=JSON.parse(readFileSync(join(AQUI,'composio-catalogo.json'),'utf8'))
const agentMarks=JSON.parse(readFileSync(join(AQUI,'agentes-marcas.json'),'utf8'))
const catalogoVisual=JSON.parse(readFileSync(join(AQUI,'catalogo-visual.json'),'utf8'))
// Orden de la cinta de la portada: primero los más conocidos; después, el resto del catálogo tal cual.
const RIBBON_NAMES={claude:'Claude Code',gemini:'Gemini CLI',muse:'Muse Code',lmstudio:'LM Studio',ollama:'Ollama'}
const RIBBON_FIRST=['claude','codex','gemini','copilot','cursor','hermes','openclaw','qwen-code','ollama','lmstudio','deepseek','grok','mistral-vibe','kimi','opencode','aider','goose','cline','antigravity','kiro']
const RIBBON=(()=>{const all=[...catalogoVisual.agents.map(a=>a.id),'lmstudio','ollama'];const order=[...RIBBON_FIRST.filter(id=>all.includes(id)),...all.filter(id=>!RIBBON_FIRST.includes(id))];return order.map(id=>[id,RIBBON_NAMES[id]||[...catalogoVisual.agents].find(a=>a.id===id).name])})()
const plantilla = readFileSync(join(AQUI,'plantilla.html'),'utf8')
const logo = readFileSync(join(AQUI,'assets/kywai-logo.svg'),'utf8')
const logoViewBox = logo.match(/viewBox="([^"]+)"/)[1]
const [,,logoW,logoH] = logoViewBox.split(' ').map(Number)
const logoDefs = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="kywai-logo" viewBox="${logoViewBox}">${logo.replace(/^<svg[^>]*>/,'').replace(/<title>.*?<\/title>/,'').replace(/<\/svg>\s*$/,'')}</symbol></svg>`
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const json = v => JSON.stringify(v).replace(/</g,'\\u003c')
const huellas = {}
const huella = ruta => huellas[ruta] ??= createHash('sha1').update(readFileSync(join(AQUI,ruta))).digest('hex').slice(0,8)
const dirDe = (i,p) => i.dir+p.paths[IDIOMAS.indexOf(i)]
function enlace(desde,hacia,hash='') {
  const ruta=posix.relative(desde||'.',hacia||'.')
  return (ruta?ruta+'/':'./')+(PREVIEW?'index.html':'')+hash
}
const parte = name => readFileSync(join(AQUI,'paginas',name+'.html'),'utf8')
const partes=Object.fromEntries(PAGINAS.filter(p=>p.file).map(p=>[p.id,parte(p.file)]))
const terminal=parte('terminal'), apoyar=parte('apoyar')
const patrones={win:/Setup.*\.exe$/,'mac-arm':/arm64\.dmg$/,'mac-intel':/x64\.dmg$/,'linux-x64':/x86_64\.AppImage$/,'linux-arm':/arm64\.AppImage$/,android:/orbita\.apk$/}
rmSync(SALIDA,{recursive:true,force:true});mkdirSync(SALIDA,{recursive:true})
cpSync(join(AQUI,'assets'),join(SALIDA,'assets'),{recursive:true})
for(const [src,dst] of [['instalar-kywai.sh','install.sh'],['instalar-kywai.ps1','install.ps1']])cpSync(join(AQUI,'../scripts',src),join(SALIDA,dst))
cpSync(join(AQUI,'raiz'),SALIDA,{recursive:true})
for(const pagina of ['terminos','privacidad']) {
  let html=readFileSync(join(AQUI,'legal',pagina+'.html'),'utf8').replace('{{legalBrand}}',logoDefs+`<a class="brand" href="../" aria-label="kywai"><svg class="logo" viewBox="${logoViewBox}" aria-hidden="true"><use href="#kywai-logo"/></svg></a>`)
  html=html.replace(/(\.\.\/assets\/site\.(?:css|js))(?=")/g,ruta=>ruta+'?v='+huella(ruta.slice(3)))
  if(PREVIEW)html=html.replace(/href="\.\.\/((?:terminos|privacidad)\/)?"/g,(_,d)=>`href="../${d??''}index.html"`)
  mkdirSync(join(SALIDA,pagina),{recursive:true});writeFileSync(join(SALIDA,pagina,'index.html'),html)
}
for(const idioma of IDIOMAS) {
  const t=TEXTOS[idioma.code],s=SECCIONES[idioma.code],pricing=PRECIOS[idioma.code],presentation=PRESENTACION[idioma.code],showcase=ESCAPARATE[idioma.code],guides=GUIAS[idioma.code],visual=VISUALES[idioma.code],recorrido=RECORRIDO[idioma.code]
  const faltan=[...Object.keys(TEXTOS.en).filter(k=>!(k in t)),...Object.keys(SECCIONES.en).filter(k=>!(k in s)),...Object.keys(PRECIOS.en).filter(k=>!(k in pricing)),...Object.keys(PRESENTACION.en).filter(k=>!(k in presentation)),...Object.keys(ESCAPARATE.en).filter(k=>!(k in showcase)),...Object.keys(GUIAS.en).filter(k=>!(k in guides)),...Object.keys(VISUALES.en).filter(k=>!(k in visual)),...Object.keys(RECORRIDO.en).filter(k=>!(k in recorrido))]
  if(faltan.length||s.labels.length!==PAGINAS.length)throw Error(`Faltan textos en ${idioma.code}: ${faltan}`)
  for(const [key,value] of Object.entries(ESCAPARATE.en)) {
    if(Array.isArray(value) && (!Array.isArray(showcase[key]) || showcase[key].length!==value.length))throw Error(`Lista incompleta en ${idioma.code}: ${key}`)
    if(key==='featureTags' && value.some((tags,i)=>showcase[key][i].length!==tags.length))throw Error(`Etiquetas incompletas en ${idioma.code}`)
  }
  const label=id=>s.labels[PAGINAS.findIndex(p=>p.id===id)]
  // Mi cuenta vive en otro dominio: le pasamos el idioma para que se abra igual que la web.
  const cuenta='https://cuenta.kywai.app/?lang='+idioma.code
  for(const pagina of PAGINAS) {
    const dir=dirDe(idioma,pagina),base='../'.repeat(dir.split('/').filter(Boolean).length)
    const url=(id,hash='')=>enlace(dir,dirDe(idioma,PAGINAS.find(p=>p.id===id)),hash)
    const link=id=>`<a href="${url(id)}"${pagina.id===id?' aria-current="page"':''}>${esc(label(id))}</a>`
    const navigation=`<nav class="nav" aria-label="kywai">${['funciones','agentes','conectores','precios','ayuda'].map(link).join('')}</nav><details class="mobile-menu"><summary>${esc(s.menu)}</summary><nav aria-label="${esc(s.menu)}">${PAGINAS.map(p=>link(p.id)).join('')}</nav></details>`
    const langs=Object.fromEntries(IDIOMAS.map(o=>[o.code,enlace(dir,dirDe(o,pagina))]))
    const langLinks=IDIOMAS.map(o=>`<li><a href="${langs[o.code]}" hreflang="${o.hreflang}" lang="${o.hreflang}" data-lang="${o.code}"${o.code===idioma.code?' aria-current="page"':''}>${o.label}</a></li>`).join('')
    const hreflangs=[...IDIOMAS.map(o=>`<link rel="alternate" hreflang="${o.hreflang}" href="${SITIO}${dirDe(o,pagina)}">`),`<link rel="alternate" hreflang="x-default" href="${SITIO}${dirDe(IDIOMAS[0],pagina)}">`].join('\n')
    const steps=arr=>`<ol class="install-steps">${arr.map(v=>`<li>${esc(v)}</li>`).join('')}</ol>`
    const download=(id,title)=>{
      const a=RELEASE.assets.find(a=>patrones[id].test(a.name))
      return `<div class="download-option"><a class="btn btn-primary" data-artifact="${id}" href="${esc(a?.browser_download_url??RELEASES)}">${esc(title)} <span aria-hidden="true">↓</span></a><small data-artifact-info="${id}">${a?esc(a.name)+' · '+Math.round(a.size/1048576)+' MB':esc(s.notes)}</small></div>`
    }
    const osCard=(id,title,subtitle,buttons,instructions,extra='')=>`<article class="platform-card" id="${id}" data-platform="${id}"><div class="platform-heading"><span class="platform-icon" aria-hidden="true">${({mac:'⌘',win:'⊞',linux:'>_',android:'↗'})[id]}</span><span class="platform-recommended" hidden>${esc(s.recommended)}</span></div><h2>${title}</h2><p class="platform-subtitle">${esc(subtitle)}</p><div class="platform-downloads">${buttons}</div><h3>${esc(s.install)}</h3>${steps(instructions)}${extra}</article>`
    const intro=(title,description,more='')=>`<section class="page-intro"><div class="wrap"><p class="eyebrow">kywai</p><h1>${esc(title)}</h1><p class="lede">${esc(description)}</p>${more}</div></section>`
    let content=partes[pagina.id]
    if(['agentes','temas','dispositivos','como'].includes(pagina.id)) {
      content=renderVisual(pagina.id,{s:visual,t,data:catalogoVisual,marks:agentMarks,lang:idioma.code,base,url,esc})
    } else if(pagina.id==='guias') {
      content=renderGuias({s:guides,url,esc})
    } else if(pagina.id==='funciones'||pagina.id==='conectores') {
      content=renderEscaparate(pagina.id,{s:showcase,composio:COMPOSIO[idioma.code],composioData,guides,t,url,base,img:idioma.code,esc})
    } else if(pagina.id==='descargas') {
      content=intro(t['download.title'],s.choose,`<p class="download-note">${esc(s.downloadNote)}</p><p class="release-meta">${esc(s.versions)} <strong id="dl-version">${esc(RELEASE.tag_name.replace(/^v/,''))}</strong> · <a href="${RELEASES}">${esc(s.notes)}</a></p>`)
        +`<section class="downloads-page"><div class="wrap"><div class="platform-grid">`
        +osCard('mac','macOS',s.chip,download('mac-arm','Apple silicon · .dmg')+download('mac-intel','Intel · .dmg'),s.mac,`<p class="platform-tip">${esc(s.chipHelp)}</p>`)
        +osCard('win','Windows',t['download.win'],download('win',s.installer+' · .exe'),s.win)
        +osCard('linux','Linux','x64 · ARM64',download('linux-x64','x64 · AppImage')+download('linux-arm','ARM64 · AppImage'),s.linux)
        +osCard('android','Órbita · Android',s.mobileNote,download('android','Android · .apk'),s.android)
        +`</div><p class="ios-note">${esc(s.ios)}</p>${terminal}<p class="download-help"><a href="${url('ayuda')}">${esc(label('ayuda'))} →</a><a href="${RELEASES}">${esc(t['download.all'])} →</a></p></div></section>`
    } else if(pagina.id==='precios') {
      // Cada plan: sus líneas (las que empiezan por «*» salen como «Próximamente») y, en los de pago, «Todo lo del anterior, y además».
      const item=v=>v.startsWith('*')?`<li class="plan-soon"><span aria-hidden="true">○</span><span>${esc(v.slice(1))} <em>${esc(pricing.soon)}</em></span></li>`:`<li><span aria-hidden="true">✓</span>${esc(v)}</li>`
      const plan=(id,name,type,amount,period,body,features,href,cta,plus)=>`<article class="pricing-card${id==='pro'?' pricing-cloud':''}" data-plan="${id}"><p class="eyebrow">${esc(type)}${id==='pro'?` <span class="plan-badge">${esc(pricing.popular)}</span>`:''}</p><h2>${esc(name)}</h2><p class="plan-price"><strong>$${amount}</strong><span>${esc(period)}</span></p><p class="plan-description">${esc(body)}</p>${plus?`<p class="plan-plus">${esc(plus)}</p>`:''}<ul>${features.map(item).join('')}</ul><a class="btn ${id==='pro'?'btn-primary':'btn-ghost'}" href="${href}">${esc(cta)} →</a></article>`
      content=intro(pricing.title,pricing.intro)+`<section class="pricing-page"><div class="wrap"><div class="pricing-grid pricing-grid-4">`
        +plan('free',pricing.free,pricing.self,'0',pricing.freePeriod,pricing.selfBody,pricing.selfFeatures,url('descargas'),pricing.freeCta)
        +plan('cloud','Cloud','kywai Cloud','10',pricing.cloudPeriod,pricing.cloudBody,pricing.cloudFeatures,cuenta,pricing.cloudCta,pricing.cloudPlus)
        +plan('pro','Pro','kywai Pro','25',pricing.cloudPeriod,pricing.proBody,pricing.proFeatures,cuenta,pricing.cloudCta,pricing.proPlus)
        +plan('max','Pro Max','kywai Pro Max','50',pricing.cloudPeriod,pricing.maxBody,pricing.maxFeatures,cuenta,pricing.cloudCta,pricing.maxPlus)
        +`</div><div class="pricing-note"><h2>${esc(pricing.noteTitle)}</h2><p>${esc(pricing.note)}</p><p class="pilot-note">${esc(pricing.availability)}</p><a href="${url('cloud')}">${esc(label('cloud'))} →</a></div></div></section>`
    } else if(pagina.id==='cloud') {
      content=intro(s.cloudTitle,s.cloudIntro,`<span class="status-label">${esc(s.pilot)}</span>`)+`<section class="cloud-page"><div class="wrap"><div class="cloud-symbol"><img src="${base}assets/kywai-simbolo.svg" alt="kywai" width="160" height="160"></div><div class="cloud-grid">${s.cloudCards.map((v,i)=>`<article><span class="eyebrow">0${i+1}</span><h2>${esc(v)}</h2><p>${esc(s.cloudBodies[i])}</p></article>`).join('')}</div><div class="cloud-invite"><h2>${esc(s.pilot)}</h2><p>${esc(s.pilotBody)}</p><div class="ctas"><a class="btn btn-primary" href="${cuenta}">${esc(s.cloudCta)}</a><a class="btn btn-ghost" href="mailto:Yilsander@kywai.app">${esc(s.cloudAccess)}</a></div><p class="platform-tip">${esc(s.cloudPricing)}</p></div></div></section>`
    } else if(pagina.id==='actualizaciones') {
      content=intro(ACTUALIZACIONES[idioma.code].title,ACTUALIZACIONES[idioma.code].lede)+renderActualizaciones({a:ACTUALIZACIONES[idioma.code],lang:idioma.code,esc,releases:RELEASES,base})
    } else if(pagina.id==='ayuda') {
      content=intro(s.helpTitle,s.helpIntro)+`<section class="help-page"><div class="wrap"><div class="help-links"><a class="btn btn-primary" href="${url('guias')}">${esc(label('guias'))} →</a><a class="btn btn-ghost" href="https://github.com/Yiku21/kywai/blob/master/docs/MANUAL.md">${esc(s.manual)} ↗</a><a class="btn btn-ghost" href="mailto:Yilsander@kywai.app">${esc(s.contact)}</a></div><div class="faq">${[[s.helpChoice,s.helpChoiceBody],[t['download.needT'],t['download.need']],[t['download.helpT'],t['download.help']],[t['download.nextT'],t['download.next']]].map(([q,a])=>`<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></div></section>`+apoyar
    }
    const footer=`<footer class="site-footer"><div class="wrap"><div class="footer-brand"><a class="brand" href="${url('inicio')}" aria-label="kywai"><svg class="logo" viewBox="${logoViewBox}" aria-hidden="true"><use href="#kywai-logo"/></svg></a><p>${esc(t['footer.made'])}</p><a class="footer-inception" href="https://www.nvidia.com/en-us/startups/" rel="noopener"><img src="${base}assets/marcas/nvidia-inception.svg" alt="NVIDIA Inception Program" width="79" height="34" loading="lazy"></a></div><div><h2>${esc(s.explore)}</h2>${['como','funciones','agentes','conectores','dispositivos','temas'].map(link).join('')}</div><div><h2>kywai</h2>${['descargas','cloud','precios','guias','actualizaciones','ayuda'].map(link).join('')}<a href="${cuenta}">${esc(s.account)}</a></div><div><h2>${esc(s.project)}</h2><a href="https://github.com/Yiku21/kywai">GitHub</a><a href="${RELEASES}">${esc(s.notes)}</a><a href="https://ko-fi.com/yilsander">${esc(s.support)}</a></div><div class="footer-bottom"><a href="https://github.com/Yiku21/kywai/blob/master/LICENSE">${esc(t['footer.license'])}</a><nav class="footer-legal"><a href="${base}privacidad/${PREVIEW?'index.html':''}${idioma.code==='es'?'':'#en'}">${esc(t['footer.privacyPolicy'])}</a><a href="${base}terminos/${PREVIEW?'index.html':''}${idioma.code==='es'?'':'#en'}">${esc(t['footer.terms'])}</a></nav><p class="footer-trademark">© 2026 NVIDIA, the NVIDIA logo, and NVIDIA Inception are trademarks and/or registered trademarks of NVIDIA Corporation in the U.S. and other countries.</p></div></div></footer>`
    const owners={how:['como',''],ideas:['como','#ideas'],features:['funciones',''],extensions:['conectores',''],studio:['funciones','#studio'],capabilities:['funciones','#capabilities'],anywhere:['dispositivos',''],download:['descargas',''],install:['descargas','#install'],video:['inicio','#video']}
    const hashLinks=Object.fromEntries(Object.entries(owners).map(([key,[id,hash]])=>[key,url(id,hash)]))
    const title=pagina.id==='inicio'?'kywai · '+presentation.title+' '+presentation.titleEnd:label(pagina.id)+' · kywai'
    const descriptions={inicio:'meta.desc',como:'how.lede',funciones:'features.lede',agentes:'agents.lede',conectores:'extensions.lede',dispositivos:'anywhere.lede',temas:'themes.lede'}
    const visualDescriptions={agentes:'agentsIntro',temas:'themesIntro',dispositivos:'devicesIntro',como:'howIntro'}
    const description=visualDescriptions[pagina.id]?visual[visualDescriptions[pagina.id]]:pagina.id==='guias'?guides.intro:pagina.id==='funciones'?showcase.featuresIntro:pagina.id==='conectores'?showcase.connectorsIntro:pagina.id==='inicio'?presentation.intro:pagina.id==='cloud'?s.cloudIntro:pagina.id==='ayuda'?s.helpIntro:pagina.id==='actualizaciones'?ACTUALIZACIONES[idioma.code].lede:pagina.id==='descargas'?s.downloadNote:pagina.id==='precios'?pricing.intro:t[descriptions[pagina.id]]
    // Portada: cinta con el catálogo real de agentes (los mismos de la página Agentes, con su marca oficial).
    const ribbonAgent=([id,name],copy)=>{const mark=agentMarks.find(m=>m.id===id);if(!mark)throw Error('Falta logo oficial: '+id);return `<li><a href="${esc(mark.website)}" target="_blank" rel="noopener noreferrer"${copy?' tabindex="-1"':''}><img src="${base}${mark.path.replace(/^web\//,'')}" alt="" width="28" height="28" loading="lazy"><span>${esc(name)}</span></a></li>`}
    const ribbonRow=(list,cls)=>`<div class="agent-marquee-row ${cls}"><ul>${list.map(a=>ribbonAgent(a,false)).join('')}</ul><ul aria-hidden="true">${list.map(a=>ribbonAgent(a,true)).join('')}</ul></div>`
    const agentRibbon=`<section class="agent-ribbon" aria-label="${esc(presentation.stack)}"><div class="agent-ribbon-head"><p class="agent-ribbon-kicker">${esc(presentation.stack)}</p><p class="agent-ribbon-count"><strong>${RIBBON.length}</strong> ${esc(presentation.count)}</p><p class="agent-ribbon-note">${esc(presentation.countNote)}</p><a class="text-link" href="${url('agentes')}">${esc(presentation.allAgents)} →</a></div><div class="agent-marquee">${ribbonRow(RIBBON.filter((_,i)=>i%2===0),'agent-marquee-a')}${ribbonRow(RIBBON.filter((_,i)=>i%2===1),'agent-marquee-b')}</div></section>`
    // Portada 1.0: recorrido por las pantallas, sello y franja «Lo nuevo en la 1.0» (recorrido.mjs).
    const {tour,badge}=renderRecorrido({r:recorrido,lang:idioma.code,base,esc,badgeUrl:url('actualizaciones')})
    const values={...Object.fromEntries(Object.entries(presentation).map(([k,v])=>['home.'+k,esc(v)])),...Object.fromEntries(Object.entries(t).map(([k,v])=>[k,esc(v)])),...Object.fromEntries(Object.entries(s).filter(([,v])=>typeof v==='string').map(([k,v])=>['site.'+k,esc(v)])),
      'site.features':esc(label('funciones')),'meta.title':esc(title),'meta.desc':esc(description),'nav.account':esc(s.account),accountUrl:cuenta,lang:idioma.hreflang,langLabel:idioma.label,ogLocale:idioma.og,base,home:url('inicio'),img:idioma.code,site:SITIO,canonical:SITIO+dir,releases:RELEASES,hreflangs,langLinks,logoDefs,logoViewBox,logoRatio:`${logoW} / ${logoH}`,pageId:pagina.id,downloadUrl:url('descargas'),pricingUrl:url('precios'),agentRibbon,tour,releaseBadge:badge,navigation,footer,
      siteConfig:json({lang:idioma.code,translations:langs,hashLinks,downloadUrl:url('descargas'),forLabel:t['hero.ctaFor']}),
      jsonld:json({'@context':'https://schema.org','@type':pagina.id==='inicio'?'SoftwareApplication':'WebPage',name:title,url:SITIO+dir,description,inLanguage:idioma.hreflang,...(pagina.id==='inicio'?{applicationCategory:'DeveloperApplication',operatingSystem:'Windows, macOS, Linux, Android',license:'https://github.com/Yiku21/kywai/blob/master/LICENSE',isAccessibleForFree:true,downloadUrl:RELEASES,codeRepository:'https://github.com/Yiku21/kywai'}:{})})}
    let html=plantilla.replace('{{content}}',content)
    html=html.replace(/\{\{([\w.]+)\}\}/g,(match,key)=>{if(!(key in values))throw Error(`Hueco sin valor: ${match}`);return values[key]})
    html=html.replace(/href="#(how|ideas|features|extensions|studio|capabilities|anywhere|download|install|video)"/g,(_,id)=>`href="${hashLinks[id]}"`)
    html=html.replace(/((?:\.\.\/)*assets\/[\w/.-]+\.(?:jpg|png|webp|svg|mp4|woff2|css|js))(?=["')])/g,ruta=>ruta+'?v='+huella(ruta.replace(/^(\.\.\/)+/,'')))
    const destino=join(SALIDA,dir,'index.html');mkdirSync(dirname(destino),{recursive:true});writeFileSync(destino,html)
  }
}
if(!PREVIEW) {
  writeFileSync(join(SALIDA,'CNAME'),'kywai.app\n');writeFileSync(join(SALIDA,'.nojekyll'),'')
  writeFileSync(join(SALIDA,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${SITIO}sitemap.xml\n`)
  const urls=PAGINAS.flatMap(p=>IDIOMAS.map(i=>`  <url><loc>${SITIO}${dirDe(i,p)}</loc>${IDIOMAS.map(o=>`<xhtml:link rel="alternate" hreflang="${o.hreflang}" href="${SITIO}${dirDe(o,p)}"/>`).join('')}</url>`))
  urls.push(...['terminos/','privacidad/'].map(p=>`  <url><loc>${SITIO}${p}</loc></url>`))
  writeFileSync(join(SALIDA,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`)
  writeFileSync(join(SALIDA,'404.html'),'<!doctype html><meta charset="utf-8"><title>kywai</title><a href="/">kywai.app</a>')
}
console.log(`Web generada en ${SALIDA}: ${PAGINAS.length} páginas × ${IDIOMAS.length} idiomas`)
