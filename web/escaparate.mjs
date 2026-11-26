import { renderComposio } from './composio.mjs'
import { icon, brandSymbol } from './iconos.mjs'
// Vista rápida de las funciones y del catálogo MCP existente en la aplicación.
export const ESCAPARATE = {
  es: {
    featuresTitle: 'Todo lo que tu equipo puede hacer.', featuresIntro: 'Coordina agentes, crea contenido y automatiza trabajo. En un mismo proyecto.',
    featureNames: ['Un equipo de IA, coordinado', 'Un estudio para tus ideas', 'Trabajo que se repite, resuelto', 'Tu proyecto, en un solo lugar', 'Tus herramientas, conectadas', 'Control de principio a fin'],
    featureBodies: ["Uno o varios agentes. Tú eliges cuáles usas y quién coordina.", 'Crea vídeos, edita grabaciones y prepara voces, imágenes y clips.', 'Programa rutinas por horario, eventos o cambios en una carpeta.', 'Conserva archivos, contexto e historial para seguir donde lo dejaste.', 'Amplía lo que pueden hacer tus agentes con servicios y habilidades.', 'Consulta uso y costes, aprueba planes y revisa o deshaz cambios.'],
    featureTags: [['Planes','Trabajo en paralelo','Revisión'],['Vídeo','Voz','Edición','Clips'],['Horarios','Webhooks','Carpetas'],['Archivos','Memoria','Historial'],['MCP','Skills','Plugins','Mods'],['Tokens','Presupuestos','Cambios']],
    exploreConnections: 'Explorar conectores', visualTitle: 'Y puedes ver a tu equipo trabajando.', visualBody: 'Un espacio 3D con temas propios. Escritorio, navegador y Órbita para Android.', visualLink: 'Ver dispositivos y temas', allFeatures: 'Ver todas las funciones en detalle', moreTitle: 'También viene con esto', download: 'Empezar gratis', pricing: 'Ver Cloud y precios',
    connectorsTitle: 'Más herramientas. Más posibilidades.', connectorsIntro: 'Conecta servicios para que tus agentes puedan investigar, programar, navegar y crear.', catalogue: 'Explora las conexiones', desktop: 'Catálogo MCP · Escritorio', desktopNote: 'Se configuran dentro de kywai. La disponibilidad depende del agente y de los requisitos de cada servicio.',
    filters: ['Todas','Código','Web e investigación','Creatividad'], connect: 'Cómo conectar', docs: 'Documentación', steps: ['Abre kywai → Ajustes → Extensiones → Servidores MCP.', 'Busca este servicio en el catálogo y añade su conexión.', 'Elige los agentes compatibles y prueba la conexión antes de activarla.'], needsKey: 'Necesita tu token o clave del servicio.', noKey: 'No requiere una clave en su configuración destacada.',
    descriptions: ['Repositorios, issues y pull requests.', 'Un navegador que hace clic y toma capturas.', 'Documentación de librerías al día.', 'Preguntas sobre repositorios públicos.', 'Convierte páginas web en texto.', 'Rastrea webs y extrae datos.', 'Navegación web para agentes.', 'Investigación en internet con fuentes.', 'Pixel art, personajes y animaciones.', 'Analítica de tu web o aplicación.', 'Razonamiento paso a paso.'],
    cloudTitle: 'Tus apps del día a día, en Cloud.', cloudIntro: 'Conecta tus apps con Composio desde Mi cuenta. Cada usuario autoriza sus propias cuentas.', coming: 'En el piloto de Cloud', cloudNames: ['Correo','Documentos','Archivos','Mensajes','Calendario'], cloudAccess: 'Conocer kywai Cloud',
    extensionsTitle: 'Más formas de ampliar tu equipo', extensionNames: ['Skills','Plugins','Mods'], extensionBodies: ['Habilidades reutilizables para tus tareas.','Paquetes de habilidades y herramientas compatibles.','Órdenes, automatizaciones y paneles de kywai.'], compatibility: 'Ver compatibilidad y requisitos', empty: 'No hay conexiones en esta categoría.',
  },
  en: {
    featuresTitle: 'Everything your team can do.', featuresIntro: 'Coordinate agents, create content and automate work. In one project.',
    featureNames: ['An AI team, coordinated', 'A studio for your ideas', 'Recurring work, handled', 'Your project in one place', 'Your tools, connected', 'Control from start to finish'],
    featureBodies: ["One agent or several. You choose which ones to use and who coordinates.", 'Create videos, edit recordings and prepare voices, images and clips.', 'Schedule routines by time, events or changes in a folder.', 'Keep files, context and history to pick up where you left off.', 'Expand what your agents can do with services and skills.', 'Track usage and costs, approve plans, and inspect or undo changes.'],
    featureTags: [['Plans','Parallel work','Review'],['Video','Voice','Editing','Clips'],['Schedules','Webhooks','Folders'],['Files','Memory','History'],['MCP','Skills','Plugins','Mods'],['Tokens','Budgets','Changes']],
    exploreConnections: 'Explore connectors', visualTitle: 'And you can watch your team work.', visualBody: 'A 3D workspace with original themes. Desktop, browser and Órbita for Android.', visualLink: 'See devices and themes', allFeatures: 'See every feature in detail', moreTitle: 'It also comes with these', download: 'Start for free', pricing: 'See Cloud and pricing',
    connectorsTitle: 'More tools. More possibilities.', connectorsIntro: 'Connect services so your agents can research, code, browse and create.', catalogue: 'Explore connections', desktop: 'MCP catalog · Desktop', desktopNote: 'Set these up inside kywai. Availability depends on the agent and each service’s requirements.',
    filters: ['All','Code','Web and research','Creative'], connect: 'How to connect', docs: 'Documentation', steps: ['Open kywai → Settings → Extensions → MCP servers.', 'Find this service in the catalog and add its connection.', 'Choose compatible agents and test the connection before enabling it.'], needsKey: 'Requires your service token or API key.', noKey: 'No key required in its featured configuration.',
    descriptions: ['Repositories, issues and pull requests.', 'A browser that clicks and takes screenshots.', 'Up-to-date library documentation.', 'Questions about public repositories.', 'Turn web pages into text.', 'Crawl websites and extract data.', 'Web browsing for agents.', 'Internet research with sources.', 'Pixel art, characters and animations.', 'Analytics for your website or app.', 'Step-by-step reasoning.'],
    cloudTitle: 'Your everyday apps, in Cloud.', cloudIntro: 'Connect your apps through Composio from My account. Each user authorizes their own accounts.', coming: 'In the Cloud pilot', cloudNames: ['Email','Documents','Files','Messages','Calendar'], cloudAccess: 'Explore kywai Cloud',
    extensionsTitle: 'More ways to extend your team', extensionNames: ['Skills','Plugins','Mods'], extensionBodies: ['Reusable skills for your tasks.','Packages of compatible skills and tools.','Commands, automations and kywai panels.'], compatibility: 'See compatibility and requirements', empty: 'No connections in this category.',
  },
  pt: {
    featuresTitle: 'Tudo o que sua equipe pode fazer.', featuresIntro: 'Coordene agentes, crie conteúdo e automatize tarefas. No mesmo projeto.',
    featureNames: ['Uma equipe de IA coordenada', 'Um estúdio para suas ideias', 'Trabalho recorrente, resolvido', 'Seu projeto em um só lugar', 'Suas ferramentas conectadas', 'Controle do início ao fim'],
    featureBodies: ["Um agente ou vários. Você escolhe quais usar e quem coordena.", 'Crie vídeos, edite gravações e prepare vozes, imagens e clipes.', 'Programe rotinas por horário, eventos ou alterações em uma pasta.', 'Mantenha arquivos, contexto e histórico para retomar de onde parou.', 'Amplie seus agentes com serviços e habilidades.', 'Acompanhe uso e custos, aprove planos e revise ou desfaça alterações.'],
    featureTags: [['Planos','Trabalho paralelo','Revisão'],['Vídeo','Voz','Edição','Clipes'],['Horários','Webhooks','Pastas'],['Arquivos','Memória','Histórico'],['MCP','Skills','Plugins','Mods'],['Tokens','Orçamentos','Alterações']],
    exploreConnections: 'Explorar conectores', visualTitle: 'E você pode ver a equipe trabalhando.', visualBody: 'Um espaço 3D com temas próprios. Desktop, navegador e Órbita para Android.', visualLink: 'Ver dispositivos e temas', allFeatures: 'Ver todas as funções em detalhe', moreTitle: 'Também inclui', download: 'Começar grátis', pricing: 'Ver Cloud e preços',
    connectorsTitle: 'Mais ferramentas. Mais possibilidades.', connectorsIntro: 'Conecte serviços para seus agentes pesquisarem, programarem, navegarem e criarem.', catalogue: 'Explorar conexões', desktop: 'Catálogo MCP · Desktop', desktopNote: 'Configure dentro do kywai. A disponibilidade depende do agente e dos requisitos de cada serviço.',
    filters: ['Todas','Código','Web e pesquisa','Criatividade'], connect: 'Como conectar', docs: 'Documentação', steps: ['Abra kywai → Ajustes → Extensões → Servidores MCP.', 'Busque este serviço no catálogo e adicione sua conexão.', 'Escolha agentes compatíveis e teste a conexão antes de ativá-la.'], needsKey: 'Requer seu token ou chave do serviço.', noKey: 'Não requer chave na configuração em destaque.',
    descriptions: ['Repositórios, issues e pull requests.', 'Navegador que clica e tira capturas.', 'Documentação atualizada de bibliotecas.', 'Perguntas sobre repositórios públicos.', 'Converta páginas web em texto.', 'Rastreie sites e extraia dados.', 'Navegação web para agentes.', 'Pesquisa na internet com fontes.', 'Pixel art, personagens e animações.', 'Análise do seu site ou aplicativo.', 'Raciocínio passo a passo.'],
    cloudTitle: 'Seus apps do dia a dia no Cloud.', cloudIntro: 'Conecte seus apps com o Composio em Minha conta. Cada usuário autoriza suas próprias contas.', coming: 'No piloto do Cloud', cloudNames: ['E-mail','Documentos','Arquivos','Mensagens','Calendário'], cloudAccess: 'Conhecer o kywai Cloud',
    extensionsTitle: 'Mais formas de ampliar sua equipe', extensionNames: ['Skills','Plugins','Mods'], extensionBodies: ['Habilidades reutilizáveis nas suas tarefas.','Pacotes de habilidades e ferramentas compatíveis.','Comandos, automações e painéis do kywai.'], compatibility: 'Ver compatibilidade e requisitos', empty: 'Nenhuma conexão nesta categoria.',
  },
  fr: {
    featuresTitle: 'Tout ce que votre équipe peut faire.', featuresIntro: 'Coordonnez des agents, créez du contenu et automatisez le travail. Dans un même projet.',
    featureNames: ['Une équipe IA coordonnée', 'Un studio pour vos idées', 'Les tâches récurrentes, organisées', 'Votre projet au même endroit', 'Vos outils connectés', 'Le contrôle de bout en bout'],
    featureBodies: ["Un agent ou plusieurs. Vous choisissez lesquels utiliser et qui coordonne.", 'Créez des vidéos, montez des enregistrements et préparez voix, images et clips.', 'Programmez des routines par horaire, événement ou changement de dossier.', 'Conservez fichiers, contexte et historique pour reprendre votre travail.', 'Étendez vos agents avec des services et des compétences.', 'Suivez consommation et coûts, approuvez les plans et consultez ou annulez les changements.'],
    featureTags: [['Plans','Travail parallèle','Vérification'],['Vidéo','Voix','Montage','Clips'],['Horaires','Webhooks','Dossiers'],['Fichiers','Mémoire','Historique'],['MCP','Skills','Plugins','Mods'],['Tokens','Budgets','Changements']],
    exploreConnections: 'Explorer les connecteurs', visualTitle: 'Et vous pouvez voir l’équipe au travail.', visualBody: 'Un espace 3D avec des thèmes originaux. Bureau, navigateur et Órbita pour Android.', visualLink: 'Voir les appareils et thèmes', allFeatures: 'Voir toutes les fonctions en détail', moreTitle: 'Également inclus', download: 'Commencer gratuitement', pricing: 'Voir Cloud et les tarifs',
    connectorsTitle: 'Plus d’outils. Plus de possibilités.', connectorsIntro: 'Connectez des services pour permettre aux agents de chercher, coder, naviguer et créer.', catalogue: 'Explorer les connexions', desktop: 'Catalogue MCP · Bureau', desktopNote: 'À configurer dans kywai. La disponibilité dépend de l’agent et des exigences du service.',
    filters: ['Tous','Code','Web et recherche','Créativité'], connect: 'Comment connecter', docs: 'Documentation', steps: ['Ouvrez kywai → Réglages → Extensions → Serveurs MCP.', 'Recherchez ce service dans le catalogue et ajoutez sa connexion.', 'Choisissez des agents compatibles et testez la connexion avant de l’activer.'], needsKey: 'Votre token ou clé du service est nécessaire.', noKey: 'Aucune clé requise dans sa configuration proposée.',
    descriptions: ['Dépôts, issues et pull requests.', 'Un navigateur qui clique et prend des captures.', 'Documentation à jour des bibliothèques.', 'Questions sur les dépôts publics.', 'Transformez les pages web en texte.', 'Parcourez les sites et extrayez des données.', 'Navigation web pour les agents.', 'Recherche internet avec des sources.', 'Pixel art, personnages et animations.', 'Analyse de votre site ou application.', 'Raisonnement étape par étape.'],
    cloudTitle: 'Vos apps quotidiennes, dans Cloud.', cloudIntro: 'Connectez vos apps via Composio depuis Mon compte. Chaque utilisateur autorise ses propres comptes.', coming: 'Dans le pilote Cloud', cloudNames: ['E-mail','Documents','Fichiers','Messages','Calendrier'], cloudAccess: 'Découvrir kywai Cloud',
    extensionsTitle: 'D’autres façons d’étendre votre équipe', extensionNames: ['Skills','Plugins','Mods'], extensionBodies: ['Compétences réutilisables pour vos tâches.','Ensembles de compétences et outils compatibles.','Commandes, automatisations et panneaux kywai.'], compatibility: 'Voir la compatibilité et les prérequis', empty: 'Aucune connexion dans cette catégorie.',
  },
  zh: {
    featuresTitle: '一眼了解团队的能力。', featuresIntro: '协调智能体、创作内容并自动化工作，都在同一个项目中。',
    featureNames: ['协调一致的 AI 团队','创意工作室','安排重复工作','项目集中管理','连接你的工具','全程保持掌控'],
    featureBodies: ["一个或多个智能体，由你决定使用哪些、使用多少，以及由谁协调。",'创建视频、编辑录制内容，制作语音、图片和短片。','按时间、事件或文件夹变化设置例行任务。','保留文件、上下文和历史，随时继续工作。','通过服务和技能拓展智能体的能力。','查看用量和费用，批准计划，审查或撤销更改。'],
    featureTags: [['计划','并行工作','审查'],['视频','语音','剪辑','短片'],['定时','Webhook','文件夹'],['文件','记忆','历史'],['MCP','Skills','插件','Mods'],['Token','预算','更改']],
    exploreConnections: '探索连接器', visualTitle: '还能看到团队在工作。', visualBody: '拥有原创主题的 3D 空间，支持桌面、浏览器及 Android 配套应用 Órbita。', visualLink: '查看设备和主题', allFeatures: '查看所有功能详情', moreTitle: '还包括这些能力', download: '免费开始', pricing: '查看 Cloud 和价格',
    connectorsTitle: '更多工具，更多可能。', connectorsIntro: '连接服务，让智能体研究、编程、浏览和创作。', catalogue: '探索连接', desktop: 'MCP 目录 · 桌面版', desktopNote: '在 kywai 中配置。可用性取决于智能体和各服务的要求。',
    filters: ['全部','代码','网页与研究','创作'], connect: '如何连接', docs: '文档', steps: ['打开 kywai → 设置 → 扩展 → MCP 服务器。','在目录中查找此服务并添加连接。','选择兼容的智能体，测试连接后再启用。'], needsKey: '需要你自己的服务 token 或密钥。', noKey: '目录中的默认配置不需要密钥。',
    descriptions: ['仓库、issue 和 pull request。','点击网页并截取屏幕的浏览器。','最新的软件库文档。','询问公开仓库的相关问题。','将网页转换为文本。','抓取网站并提取数据。','为智能体提供网页浏览能力。','带来源的互联网研究。','像素画、角色与动画。','网站或应用的数据分析。','逐步推理。'],
    cloudTitle: '在 Cloud 中连接日常应用。', cloudIntro: '通过 Composio 在“我的账户”中连接你的应用。每位用户授权自己的账户。', coming: 'Cloud 试用中可用', cloudNames: ['邮件','文档','文件','消息','日历'], cloudAccess: '了解 kywai Cloud',
    extensionsTitle: '更多团队扩展方式', extensionNames: ['Skills','插件','Mods'], extensionBodies: ['可重复使用的任务技能。','兼容的技能和工具包。','kywai 命令、自动化与面板。'], compatibility: '查看兼容性和要求', empty: '该分类暂无连接。',
  },
  hi: {
    "featuresTitle": "आपकी टीम जो कुछ कर सकती है।",
    "featuresIntro": "एजेंटों का समन्वय करें, सामग्री बनाएँ और काम ऑटोमेट करें। एक ही प्रोजेक्ट में।",
    "featureNames": [
     "एक AI टीम, समन्वित",
     "आपके विचारों के लिए एक स्टूडियो",
     "बार-बार का काम, संभला हुआ",
     "आपका प्रोजेक्ट एक जगह",
     "आपके टूल, जुड़े हुए",
     "शुरू से अंत तक नियंत्रण"
    ],
    "featureBodies": [
     "एक एजेंट या कई। आप चुनते हैं कि कौन-से इस्तेमाल हों और समन्वय कौन करे।",
     "वीडियो बनाएँ, रिकॉर्डिंग एडिट करें और आवाज़ें, तस्वीरें व क्लिप तैयार करें।",
     "समय, इवेंट या किसी फ़ोल्डर में बदलाव के हिसाब से रूटीन शेड्यूल करें।",
     "फ़ाइलें, संदर्भ और इतिहास संभालकर रखें ताकि जहाँ छोड़ा था वहीं से शुरू कर सकें।",
     "सेवाओं और स्किल्स से अपने एजेंटों की क्षमता बढ़ाएँ।",
     "उपयोग और लागत पर नज़र रखें, योजनाएँ मंज़ूर करें, और बदलाव देखें या पलटें।"
    ],
    "featureTags": [
     [
      "योजनाएँ",
      "समानांतर काम",
      "समीक्षा"
     ],
     [
      "वीडियो",
      "आवाज़",
      "एडिटिंग",
      "क्लिप"
     ],
     [
      "शेड्यूल",
      "Webhooks",
      "फ़ोल्डर"
     ],
     [
      "फ़ाइलें",
      "मेमोरी",
      "इतिहास"
     ],
     [
      "MCP",
      "स्किल्स",
      "प्लगइन",
      "मॉड"
     ],
     [
      "टोकन",
      "बजट",
      "बदलाव"
     ]
    ],
    "exploreConnections": "कनेक्टर देखें",
    "visualTitle": "और आप अपनी टीम को काम करते देख सकते हैं।",
    "visualBody": "मूल थीम वाला एक 3D वर्कस्पेस। डेस्कटॉप, ब्राउज़र और Android के लिए Órbita।",
    "visualLink": "डिवाइस और थीम देखें",
    "allFeatures": "हर सुविधा विस्तार से देखें",
    "moreTitle": "इसके साथ ये भी आते हैं",
    "download": "मुफ़्त में शुरू करें",
    "pricing": "Cloud और कीमतें देखें",
    "connectorsTitle": "ज़्यादा टूल। ज़्यादा संभावनाएँ।",
    "connectorsIntro": "सेवाएँ जोड़ें ताकि आपके एजेंट खोज कर सकें, कोड लिख सकें, ब्राउज़ कर सकें और बना सकें।",
    "catalogue": "कनेक्शन देखें",
    "desktop": "MCP कैटलॉग · डेस्कटॉप",
    "desktopNote": "इन्हें kywai के अंदर सेट करें। उपलब्धता एजेंट और हर सेवा की ज़रूरतों पर निर्भर करती है।",
    "filters": [
     "सभी",
     "कोड",
     "वेब और खोज",
     "क्रिएटिव"
    ],
    "connect": "कैसे जोड़ें",
    "docs": "दस्तावेज़",
    "steps": [
     "kywai खोलें → Settings → Extensions → MCP servers।",
     "कैटलॉग में यह सेवा ढूँढें और इसका कनेक्शन जोड़ें।",
     "संगत एजेंट चुनें और चालू करने से पहले कनेक्शन आज़माएँ।"
    ],
    "needsKey": "आपकी सेवा का टोकन या API कुंजी चाहिए।",
    "noKey": "चुने हुए कॉन्फ़िगरेशन में किसी कुंजी की ज़रूरत नहीं।",
    "descriptions": [
     "रिपॉज़िटरी, issues और pull requests।",
     "एक ब्राउज़र जो क्लिक करता है और स्क्रीनशॉट लेता है।",
     "लाइब्रेरी के अप-टू-डेट दस्तावेज़।",
     "सार्वजनिक रिपॉज़िटरी के बारे में सवाल।",
     "वेब पेजों को टेक्स्ट में बदलें।",
     "वेबसाइटें क्रॉल करें और डेटा निकालें।",
     "एजेंटों के लिए वेब ब्राउज़िंग।",
     "स्रोतों के साथ इंटरनेट पर खोज।",
     "पिक्सेल आर्ट, किरदार और एनिमेशन।",
     "आपकी वेबसाइट या ऐप के लिए एनालिटिक्स।",
     "कदम-दर-कदम तर्क।"
    ],
    "cloudTitle": "आपके रोज़ के ऐप, Cloud में।",
    "cloudIntro": "Composio के ज़रिए “मेरा खाता” से अपने ऐप जोड़ें। हर उपयोगकर्ता अपने खुद के खाते अधिकृत करता है।",
    "coming": "Cloud पायलट में उपलब्ध",
    "cloudNames": [
     "ईमेल",
     "दस्तावेज़",
     "फ़ाइलें",
     "संदेश",
     "कैलेंडर"
    ],
    "cloudAccess": "kywai Cloud देखें",
    "extensionsTitle": "अपनी टीम बढ़ाने के और तरीके",
    "extensionNames": [
     "स्किल्स",
     "प्लगइन",
     "मॉड"
    ],
    "extensionBodies": [
     "आपके कामों के लिए दोबारा इस्तेमाल होने वाली स्किल्स।",
     "संगत स्किल्स और टूल्स के पैकेज।",
     "kywai के कमांड, ऑटोमेशन और पैनल।"
    ],
    "compatibility": "संगतता और ज़रूरतें देखें",
    "empty": "इस श्रेणी में कोई कनेक्शन नहीं।"
  },
}

// Estas entradas corresponden a FEATURED_MCP de src/main/catalog.ts.
export const CONEXIONES = [
  ['GitHub','GH','code','https://github.com/github/github-mcp-server',true],
  ['Playwright','PW','web','https://github.com/microsoft/playwright-mcp',false],
  ['Context7','C7','code','https://github.com/upstash/context7',false],
  ['DeepWiki','DW','code','https://deepwiki.com',false],
  ['Fetch','F','web','https://github.com/modelcontextprotocol/servers',false],
  ['Firecrawl','FC','web','https://github.com/firecrawl/firecrawl-mcp-server',true],
  ['Obscura','OB','web','https://github.com/h4ckf0r0day/obscura',false],
  ['Perplexity','P','web','https://github.com/perplexityai/modelcontextprotocol',true],
  ['PixelLab','PX','creative','https://www.pixellab.ai/vibe-coding',true],
  ['PostHog','PH','code','https://posthog.com/docs/model-context-protocol',true],
  ['Sequential Thinking','ST','code','https://github.com/modelcontextprotocol/servers',false],
]

export function renderEscaparate(id,{s,composio,composioData,guides,t,url,base,img,esc}) {
  const pills=items=>`<ul class="feature-pills">${items.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`
  if(id==='funciones') {
    const icons=['team','video','clock','folder','plug','sliders']
    const graphics=[`<div class="feature-team-art" aria-hidden="true"><b>kywai</b><span>Claude</span><span>Codex</span><span>Gemini</span></div>`,`<div class="feature-video-art" aria-hidden="true">${icon('video')}<div>${Array.from({length:16},(_,i)=>`<i style="--bar:${[30,60,45,85,55,100,65,40][i%8]}%"></i>`).join('')}</div><code>/video · /editar · /recortes</code></div>`]
    const grid=s.featureNames.map((name,i)=>`<article class="feature-tile feature-tile-${i}"${i===1?' id="studio"':''}><div class="feature-tile-top"><span class="feature-icon">${icon(icons[i])}</span><span class="card-index">0${i+1}</span></div>${graphics[i]||''}<h2>${esc(name)}</h2><p>${esc(s.featureBodies[i])}</p>${pills(s.featureTags[i])}${i===4?`<a class="text-link" href="${url('conectores')}">${esc(s.exploreConnections)} →</a>`:''}</article>`).join('')
    const extra=[9,12,17,19,21,22,23,24,26].map(n=>`<li>${icon(n%2?'team':'folder')}<span>${esc(t['features.'+n+'t'])}</span></li>`).join('')
    const detail=Array.from({length:26},(_,i)=>i+1).map(n=>`<article><h3>${esc(t['features.'+n+'t'])}</h3><p>${esc(t['features.'+n+'b'])}</p></article>`).join('')
    return `<section class="page-intro showcase-intro" id="features"><div class="wrap"><p class="eyebrow">kywai</p><h1>${esc(s.featuresTitle)}</h1><p class="lede">${esc(s.featuresIntro)}</p><div class="overview-links">${s.featureTags.map((tags,i)=>`<span>${icon(icons[i])}${esc(tags[0])}</span>`).join('')}</div></div></section><section class="showcase-page"><div class="wrap"><div class="feature-bento" id="capabilities">${grid}</div><div class="feature-world"><div><h2>${esc(s.visualTitle)}</h2><p>${esc(s.visualBody)}</p><a class="text-link" href="${url('dispositivos')}">${esc(s.visualLink)} →</a></div><a class="feature-world-images" href="${url('temas')}" aria-label="${esc(s.visualLink)}">${['orbita','marfil','matrix'].map(n=>`<img src="${base}assets/img/${img}/tema-${n}.jpg" alt="${esc(t['themes.'+({'orbita':'gallery1','marfil':'gallery2','matrix':'gallery3'})[n]])}" width="600" height="338" loading="lazy">`).join('')}</a></div><h2 class="compact-heading">${esc(s.moreTitle)}</h2><ul class="feature-extras">${extra}</ul><details class="feature-full-details"><summary>${esc(s.allFeatures)}</summary><div class="feature-detail-grid">${detail}${Array.from({length:6},(_,i)=>`<article><h3>${esc(t['studio.'+(i+1)+'t'])}</h3><p>${esc(t['studio.'+(i+1)+'b'])}</p></article>`).join('')}</div><a href="https://github.com/Yiku21/kywai/blob/master/docs/MANUAL.md">${esc(t['features.manual'])} →</a></details><div class="showcase-cta"><a class="btn btn-primary" href="${url('descargas')}">${esc(s.download)} →</a><a class="text-link" href="${url('precios')}">${esc(s.pricing)} →</a></div></div></section>`
  }
  if(id==='conectores') {
    const categories=['all','code','web','creative']
    const guideIds=['github','playwright','context7','deepwiki','fetch','firecrawl','obscura','perplexity','pixellab','posthog','sequential-thinking']
    const cards=CONEXIONES.map(([name,initial,category],i)=>`<article class="connector-card" data-connect-category="${category}"><div class="connector-summary"><span class="connector-monogram tone-${i%4}" aria-hidden="true">${brandSymbol(name,base,category==='code'?'code':category==='creative'?'video':'globe')}</span><span class="connector-title">${esc(name)}<small>MCP</small></span><p>${esc(s.descriptions[i])}</p><a class="connector-action" aria-label="${esc(guides.open+' · '+name)}" href="${url('guias','#'+guideIds[i])}">${esc(guides.open)} <span aria-hidden="true">→</span></a></div></article>`).join('')
    const connectionArt=`<div class="connection-art" aria-hidden="true"><svg viewBox="0 0 460 300" fill="none"><path d="M230 150 70 60M230 150 390 60M230 150 70 240M230 150 390 240M230 150H30m200 0h200"/></svg><div class="connection-core"><img src="${base}assets/kywai-simbolo.svg" width="76" height="76" alt=""></div>${['GitHub','Playwright','Perplexity','PostHog'].map((name,i)=>`<span class="connection-node connection-node-${i}">${brandSymbol(name,base,name==='Playwright'?'globe':'plug')}<small>${name}</small></span>`).join('')}</div>`
    return `<section class="page-intro showcase-intro connector-visual-intro" id="extensions"><div class="wrap"><p class="eyebrow">kywai</p><div class="connector-visual-layout"><div><h1>${esc(composio.title)}</h1><p class="lede">${esc(composio.intro)}</p><a class="text-link" href="${url('guias')}">${esc(guides.open)} →</a></div>${connectionArt}</div></div></section>${renderComposio({s:composio,data:composioData,base,esc})}<section class="showcase-page"><div class="wrap"><h2 class="compact-heading">${esc(composio.desktop)}</h2><aside class="guide-entry"><div><h2>${esc(guides.quickTitle)}</h2><p>${esc(guides.quickBody)}</p></div><a class="btn btn-primary" href="${url('guias','#deepwiki')}">${esc(guides.start)} →</a></aside><div class="catalog-heading" id="connection-catalog"><div><h2>${esc(s.desktop)}</h2><p>${esc(s.desktopNote)}</p></div><div class="connector-filters" role="group" aria-label="${esc(s.catalogue)}">${s.filters.map((label,i)=>`<button type="button" data-connect-filter="${categories[i]}" aria-pressed="${i===0}">${esc(label)}</button>`).join('')}</div></div><div class="connector-grid">${cards}</div><p class="connector-empty" hidden>${esc(s.empty)}</p><details class="compatibility-details"><summary>${esc(s.compatibility)}</summary><p>${esc(t['extensions.limits'])}</p></details><h2 class="compact-heading">${esc(s.extensionsTitle)}</h2><div class="extension-mini-grid">${s.extensionNames.map((name,i)=>`<article><span class="feature-icon">${icon(['folder','plug','sliders'][i])}</span><h3>${esc(name)}</h3><p>${esc(s.extensionBodies[i])}</p></article>`).join('')}</div><div class="showcase-cta"><a class="btn btn-primary" href="${url('descargas')}">${esc(s.download)} →</a><a class="text-link" href="${url('precios')}">${esc(s.pricing)} →</a></div></div></section>`
  }
  return ''
}
