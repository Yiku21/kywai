// Catálogo público del proveedor. No utiliza cuentas ni claves de Composio.
import { icon, brandSymbol } from './iconos.mjs'
export const COMPOSIO = {
 es:{title:'Tus herramientas. En un mismo espacio.',intro:'Correo, documentos, ventas, desarrollo y mucho más. Explora el catálogo de Composio que usaremos para conectar tus apps.',search:'Busca entre {n} servicios',more:'Mostrar más',details:'Ver integración',count:'servicios en el catálogo de Composio',status:'Conexión en kywai Cloud: en preparación',note:'Cada usuario autorizará sus propias cuentas. Las conexiones y los datos de una persona nunca se compartirán con otra. La disponibilidad y los permisos dependen de cada servicio.',empty:'No encontramos ese servicio.',all:'Ver catálogo completo en Composio',desktop:'También: conexiones MCP en escritorio',how:'Elige una app. Autoriza tu cuenta. Decide qué agente puede usarla.',step:['Elige tu servicio','Conecta tu propia cuenta','Controla el acceso de tus agentes']},
 en:{title:'Your tools. One workspace.',intro:'Email, documents, sales, development and much more. Explore the Composio catalog we will use to connect your apps.',search:'Search {n} services',more:'Show more',details:'View integration',count:'services in the Composio catalog',status:'Connection in kywai Cloud: in preparation',note:'Each user will authorize their own accounts. One person’s connections and data will never be shared with another. Availability and permissions depend on each service.',empty:'No matching service found.',all:'View the full Composio catalog',desktop:'Also: desktop MCP connections',how:'Choose an app. Authorize your account. Choose which agent can use it.',step:['Choose a service','Connect your own account','Control agent access']},
 pt:{title:'Suas ferramentas. Um só espaço.',intro:'E-mail, documentos, vendas, desenvolvimento e muito mais. Explore o catálogo Composio que usaremos para conectar seus apps.',search:'Buscar entre {n} serviços',more:'Mostrar mais',details:'Ver integração',count:'serviços no catálogo Composio',status:'Conexão no kywai Cloud: em preparação',note:'Cada usuário autorizará suas próprias contas. As conexões e os dados de uma pessoa nunca serão compartilhados com outra. Disponibilidade e permissões dependem do serviço.',empty:'Nenhum serviço encontrado.',all:'Ver catálogo completo no Composio',desktop:'Também: conexões MCP no desktop',how:'Escolha um app. Autorize sua conta. Defina qual agente pode usá-lo.',step:['Escolha um serviço','Conecte sua própria conta','Controle o acesso dos agentes']},
 fr:{title:'Vos outils. Un seul espace.',intro:'E-mail, documents, ventes, développement et bien plus. Explorez le catalogue Composio que nous utiliserons pour connecter vos apps.',search:'Rechercher parmi {n} services',more:'Afficher plus',details:'Voir l’intégration',count:'services dans le catalogue Composio',status:'Connexion dans kywai Cloud : en préparation',note:'Chaque utilisateur autorisera ses propres comptes. Ses connexions et données ne seront jamais partagées avec un autre utilisateur. Disponibilité et autorisations dépendent du service.',empty:'Aucun service trouvé.',all:'Voir le catalogue complet sur Composio',desktop:'Aussi : connexions MCP sur ordinateur',how:'Choisissez une app. Autorisez votre compte. Choisissez quel agent peut l’utiliser.',step:['Choisissez un service','Connectez votre propre compte','Contrôlez l’accès des agents']},
 zh:{title:'你的工具，集中在同一个空间。',intro:'邮件、文档、销售、开发等。探索我们将用于连接应用的 Composio 目录。',search:'搜索 {n} 项服务',more:'显示更多',details:'查看集成',count:'项服务收录于 Composio 目录',status:'kywai Cloud 连接功能：准备中',note:'每位用户将授权自己的账户。用户之间不会共享连接或数据。可用性和权限取决于各项服务。',empty:'未找到匹配的服务。',all:'查看完整 Composio 目录',desktop:'另有：桌面 MCP 连接',how:'选择应用，授权自己的账户，并决定哪些智能体可以使用。',step:['选择服务','连接自己的账户','控制智能体访问权限']},
 hi: {
   "title": "आपके टूल। एक ही वर्कस्पेस।",
   "intro": "ईमेल, दस्तावेज़, बिक्री, डेवलपमेंट और बहुत कुछ। Composio कैटलॉग देखें, जिससे हम आपके ऐप जोड़ेंगे।",
   "search": "{n} सेवाएँ खोजें",
   "more": "और दिखाएँ",
   "details": "इंटीग्रेशन देखें",
   "count": "सेवाएँ Composio कैटलॉग में",
   "status": "kywai Cloud में कनेक्शन: तैयारी में",
   "note": "हर उपयोगकर्ता अपने खुद के खाते अधिकृत करेगा। एक व्यक्ति के कनेक्शन और डेटा कभी किसी दूसरे के साथ साझा नहीं होंगे। उपलब्धता और अनुमतियाँ हर सेवा पर निर्भर करती हैं।",
   "empty": "कोई मिलती-जुलती सेवा नहीं मिली।",
   "all": "पूरा Composio कैटलॉग देखें",
   "desktop": "साथ ही: डेस्कटॉप MCP कनेक्शन",
   "how": "एक ऐप चुनें। अपना खाता अधिकृत करें। चुनें कि कौन-सा एजेंट इसे इस्तेमाल कर सकता है।",
   "step": [
    "सेवा चुनें",
    "अपना खाता जोड़ें",
    "एजेंट की पहुँच नियंत्रित करें"
   ]
 },
}
export function renderComposio({s,data,base,esc}){
 const label=s.search.replace('{n}',data.items.length)
 const card=(a,i)=>`<article class="composio-card"><span class="composio-logo" aria-hidden="true">${i<36?`<img src="${base}assets/composio/${a.slug}.svg" alt="" width="38" height="38" loading="lazy">`:brandSymbol(a.name,base,'plug')}</span><h3>${esc(a.name)}</h3><a href="https://docs.composio.dev/toolkits/${encodeURIComponent(a.slug)}" target="_blank" rel="noopener noreferrer">${esc(s.details)} <span aria-hidden="true">→</span><span class="sr-only"> · ${esc(a.name)}</span></a></article>`
 return `<section class="composio-catalog wrap" id="composio"><div class="composio-heading"><div><p class="eyebrow">kywai Cloud + Composio</p><h2><strong>${data.items.length.toLocaleString('en-US')}</strong> ${esc(s.count)}</h2></div><span class="status-label">${esc(s.status)}</span></div><p class="visual-note">${esc(s.note)}</p><div class="composio-steps" aria-label="${esc(s.how)}">${s.step.map((v,i)=>`<span><b>0${i+1}</b>${esc(v)}${icon(['plug','user','sliders'][i])}</span>`).join('')}</div><label class="composio-search">${icon('search')}<input type="search" data-composio-search placeholder="${esc(label)}" aria-label="${esc(label)}"></label><p class="composio-results" role="status" data-composio-results>${data.items.length} ${esc(s.count)}</p><div class="composio-grid" data-composio-grid>${data.items.slice(0,36).map(card).join('')}</div><p data-composio-empty hidden>${esc(s.empty)}</p><div class="showcase-cta"><button type="button" class="btn btn-primary" data-composio-more hidden>${esc(s.more)}</button><a class="text-link" href="${data.source}" target="_blank" rel="noopener noreferrer">${esc(s.all)} →</a></div><script type="application/json" id="composio-data">${JSON.stringify({items:data.items,base,details:s.details,count:s.count}).replace(/</g,'\\u003c')}</script></section>`
}
