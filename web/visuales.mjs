// Escaparates basados en el catálogo y las miniaturas de la aplicación.
import { icon, brandSymbol } from './iconos.mjs'
export const VISUALES = {
 es:{
  hermesSummary:"Agente con memoria, herramientas y automatizaciones.",codexSummary:'Programación, terminal y creación de prototipos.',agentsTitle:'Elige quién trabaja contigo.',agentsIntro:"Uno o varios agentes. Tú eliges cuáles usas y quién coordina.",own:"Agentes de ejemplo. Elige cuáles conectar y cuántos usar.",catalog:'Explora el catálogo',filters:['Todos','Adaptadores propios','Terminal / CLI','Modelos locales'],search:'Buscar un agente',account:'Cuenta y conexión',official:'Documentación del agente',desktop:'Catálogo de escritorio',localTitle:'También con tus modelos locales.',localBody:'Conecta LM Studio u Ollama con un modelo descargado en tu equipo.',localAccount:'Necesita el programa y un modelo local en funcionamiento.',agentSetup:'Añadir un agente, en tres pasos',agentSteps:['Abre el catálogo de agentes de kywai y elige «Añadir».','El asistente te lleva por «Programas» y «Sesiones».','Completa la instalación y la conexión con tu propia cuenta.'],agentNote:'Las cuentas, los requisitos y la compatibilidad dependen de cada proveedor. Cloud tiene su propio flujo de conexión.',
  themesTitle:'Un espacio que se siente tuyo.',themesIntro:'Mundos, colores y escenarios para trabajar a tu manera.',themeGroups:['Todos','Mundos','Ciudad digital','Decorados','Oficina'],options:'opciones',preview:'Ver tema',themeNote:'Miniaturas del modo Demo de la aplicación. Los colores de Ciudad digital comparten escenario; Oficina incluye día y noche.',chooseTheme:'Así eliges tu tema',agentTitle:'El acabado de su peluche',agentBody:'Cada agente de kywai es un peluche de fieltro. Toca a uno en el espacio 2D o 3D, pulsa «Acabado de su peluche» y elige entre 18 acabados: gominola, purpurina, galaxia, neón, perla, terciopelo… Se ve igual en el chat, las fichas y los espacios, al instante y gratis.',agentAlt:'La ventana Acabado de Claude con su peluche en acabado galaxia',chooseBody:'En kywai: Ajustes → General → Tema. Puedes seguir el tema del servidor o elegir uno para ese dispositivo.',close:'Cerrar vista previa',prev:'Anterior',next:'Siguiente',texture:'Texturas de Órbita',
  devicesTitle:'Tu proyecto, donde estés.',devicesIntro:'Empieza en tu ordenador. Continúa desde el navegador o lleva el equipo contigo en Órbita.',deviceNames:['Escritorio','Navegador','Cliente remoto','Órbita · Android'],deviceBodies:['Windows, macOS y Linux. El motor y los archivos, en el equipo que elijas.','Abre tu espacio desde otro dispositivo, sin instalar una app de iOS.','Otro ordenador se conecta a tu servidor para continuar con el mismo proyecto.','Chat, archivos y tareas en tu móvil o tableta Android.'],deviceActions:['Descargar escritorio','Conocer Cloud','Guía de conexión','Descargar Órbita'],routes:'Dos formas de estar conectado',self:'En tu equipo',selfBody:'Tu servidor encendido y conectado. Configura el acceso remoto si lo necesitas.',cloud:'En kywai Cloud',cloudBody:'Servidor operativo 24/7 y acceso al espacio sin configurar túneles. Piloto privado.',yourDevices:'Tus dispositivos',yourServer:'Tu ordenador / servidor',cloudServer:'Servidor kywai Cloud',download:'Ver descargas',pricing:'Comparar planes',demoNote:'Capturas de demostración de kywai y Órbita.',
  howTitle:'De tu idea a un trabajo en equipo.',howIntro:"Uno o varios agentes. Tú eliges cuáles usas y quién coordina.",example:'Ejemplo ilustrativo de un recorrido',request:'Crea un prototipo web a partir de este briefing.',brief:'Briefing',plan:'Plan compartido',design:'Diseño',code:'Código',research:'Investigación',approve:'Tú revisas el plan',inParallel:'Trabajo en paralelo',review:'Revisión',files:'Archivos del proyecto',result:'Resultado',howEnd:'El plan, los avances y los archivos, en el mismo lugar.',video:'Ver la demo de 30 segundos',step:'Paso',noResults:'No hay resultados con este filtro.',
 },
 en:{
  hermesSummary:"An agent with memory, tools and automations.",codexSummary:'Programming, terminal work and prototypes.',agentsTitle:'Choose who works with you.',agentsIntro:"One agent or several. You choose which ones to use and who coordinates.",own:"Example agents. Choose which ones to connect and how many to use.",catalog:'Explore the catalog',filters:['All','Native adapters','Terminal / CLI','Local models'],search:'Search agents',account:'Account and connection',official:'Agent documentation',desktop:'Desktop catalog',localTitle:'Your local models belong here too.',localBody:'Connect LM Studio or Ollama with a model downloaded on your machine.',localAccount:'Requires the program and a running local model.',agentSetup:'Add an agent in three steps',agentSteps:['Open kywai’s agent catalog and choose “Add”.','The wizard takes you through “Programs” and “Sessions”.','Complete installation and connection with your own account.'],agentNote:'Accounts, requirements and compatibility depend on each provider. Cloud has its own connection flow.',
  themesTitle:'A workspace that feels like yours.',themesIntro:'Worlds, colors and settings for the way you work.',themeGroups:['All','Worlds','Digital City','Scenery','Office'],options:'options',preview:'View theme',themeNote:'Demo-mode thumbnails from the application. Digital City colors share a scene; Office includes day and night.',chooseTheme:'Choose your theme',agentTitle:'Your plushie’s finish',agentBody:'Every kywai agent is a felt plushie. Tap one in the 2D or 3D space, press “Plushie finish” and pick from 18 finishes: gummy, glitter, galaxy, neon, pearl, velvet… It looks the same in the chat, the cards and the spaces, instantly and for free.',agentAlt:'The Finish window for Claude, with its plushie in the galaxy finish',chooseBody:'In kywai: Settings → General → Theme. Follow the server’s theme or choose one for this device.',close:'Close preview',prev:'Previous',next:'Next',texture:'Orbit textures',
  devicesTitle:'Your project, wherever you are.',devicesIntro:'Start on your computer. Continue in a browser or take your team with you in Órbita.',deviceNames:['Desktop','Browser','Remote client','Órbita · Android'],deviceBodies:['Windows, macOS and Linux. The engine and files run on the machine you choose.','Open your space from another device, without installing an iOS app.','Another computer connects to your server to continue the same project.','Chat, files and tasks on your Android phone or tablet.'],deviceActions:['Download desktop','Explore Cloud','Connection guide','Download Órbita'],routes:'Two ways to stay connected',self:'On your equipment',selfBody:'Keep your server on and online. Configure remote access if you need it.',cloud:'In kywai Cloud',cloudBody:'A server running 24/7 and access without configuring tunnels. Private pilot.',yourDevices:'Your devices',yourServer:'Your computer / server',cloudServer:'kywai Cloud server',download:'See downloads',pricing:'Compare plans',demoNote:'Demonstration screenshots of kywai and Órbita.',
  howTitle:'From your idea to teamwork.',howIntro:"One agent or several. You choose which ones to use and who coordinates.",example:'Illustrative workflow example',request:'Create a web prototype from this brief.',brief:'Brief',plan:'Shared plan',design:'Design',code:'Code',research:'Research',approve:'You review the plan',inParallel:'Working in parallel',review:'Review',files:'Project files',result:'Result',howEnd:'The plan, progress and files, all in one place.',video:'Watch the 30-second demo',step:'Step',noResults:'No results for this filter.',
 },
 pt:{
  hermesSummary:"Agente com memória, ferramentas e automações.",codexSummary:'Programação, terminal e protótipos.',agentsTitle:'Escolha quem trabalha com você.',agentsIntro:"Um agente ou vários. Você escolhe quais usar e quem coordena.",own:"Agentes de exemplo. Escolha quais conectar e quantos usar.",catalog:'Explorar o catálogo',filters:['Todos','Adaptadores próprios','Terminal / CLI','Modelos locais'],search:'Buscar um agente',account:'Conta e conexão',official:'Documentação do agente',desktop:'Catálogo de desktop',localTitle:'Seus modelos locais também têm lugar.',localBody:'Conecte LM Studio ou Ollama com um modelo baixado no seu equipamento.',localAccount:'Requer o programa e um modelo local em execução.',agentSetup:'Adicione um agente em três passos',agentSteps:['Abra o catálogo de agentes do kywai e escolha “Adicionar”.','O assistente leva você por “Programas” e “Sessões”.','Complete a instalação e a conexão com sua própria conta.'],agentNote:'Contas, requisitos e compatibilidade dependem do provedor. O Cloud tem seu próprio fluxo de conexão.',
  themesTitle:'Um espaço com a sua cara.',themesIntro:'Mundos, cores e cenários para seu jeito de trabalhar.',themeGroups:['Todos','Mundos','Cidade digital','Cenários','Escritório'],options:'opções',preview:'Ver tema',themeNote:'Miniaturas do modo Demo do aplicativo. As cores da Cidade digital compartilham um cenário; Escritório inclui dia e noite.',chooseTheme:'Escolha seu tema',agentTitle:'O acabamento da sua pelúcia',agentBody:'Cada agente do kywai é uma pelúcia de feltro. Toque em um no espaço 2D ou 3D, clique em «Acabamento da pelúcia» e escolha entre 18 acabamentos: goma, purpurina, galáxia, neon, pérola, veludo… Aparece igual no chat, nas fichas e nos espaços, na hora e de graça.',agentAlt:'A janela de acabamento do Claude com a pelúcia em acabamento galáxia',chooseBody:'No kywai: Configurações → Geral → Tema. Siga o tema do servidor ou escolha um próprio para o dispositivo.',close:'Fechar prévia',prev:'Anterior',next:'Próximo',texture:'Texturas de Órbita',
  devicesTitle:'Seu projeto, onde você estiver.',devicesIntro:'Comece no computador. Continue no navegador ou leve a equipe com você no Órbita.',deviceNames:['Desktop','Navegador','Cliente remoto','Órbita · Android'],deviceBodies:['Windows, macOS e Linux. Motor e arquivos no equipamento escolhido.','Abra seu espaço em outro dispositivo sem instalar um app de iOS.','Outro computador se conecta ao servidor para continuar no mesmo projeto.','Chat, arquivos e tarefas no celular ou tablet Android.'],deviceActions:['Baixar desktop','Conhecer Cloud','Guia de conexão','Baixar Órbita'],routes:'Duas formas de se conectar',self:'No seu equipamento',selfBody:'Mantenha seu servidor ligado e conectado. Configure acesso remoto se precisar.',cloud:'No kywai Cloud',cloudBody:'Servidor funcionando 24/7 e acesso sem configurar túneis. Piloto privado.',yourDevices:'Seus dispositivos',yourServer:'Seu computador / servidor',cloudServer:'Servidor kywai Cloud',download:'Ver downloads',pricing:'Comparar planos',demoNote:'Capturas de demonstração do kywai e Órbita.',
  howTitle:'Da sua ideia ao trabalho em equipe.',howIntro:"Um agente ou vários. Você escolhe quais usar e quem coordena.",example:'Exemplo ilustrativo de um fluxo',request:'Crie um protótipo web a partir deste briefing.',brief:'Briefing',plan:'Plano compartilhado',design:'Design',code:'Código',research:'Pesquisa',approve:'Você revisa o plano',inParallel:'Trabalho em paralelo',review:'Revisão',files:'Arquivos do projeto',result:'Resultado',howEnd:'Plano, avanços e arquivos no mesmo lugar.',video:'Ver a demo de 30 segundos',step:'Passo',noResults:'Nenhum resultado com este filtro.',
 },
 fr:{
  hermesSummary:"Un agent avec mémoire, outils et automatisations.",codexSummary:'Programmation, terminal et prototypes.',agentsTitle:'Choisissez qui travaille avec vous.',agentsIntro:"Un agent ou plusieurs. Vous choisissez lesquels utiliser et qui coordonne.",own:"Exemples d’agents. Choisissez lesquels connecter et combien utiliser.",catalog:'Explorer le catalogue',filters:['Tous','Adaptateurs natifs','Terminal / CLI','Modèles locaux'],search:'Rechercher un agent',account:'Compte et connexion',official:'Documentation de l’agent',desktop:'Catalogue de bureau',localTitle:'Vos modèles locaux aussi.',localBody:'Connectez LM Studio ou Ollama avec un modèle téléchargé sur votre machine.',localAccount:'Nécessite le programme et un modèle local en cours d’exécution.',agentSetup:'Ajouter un agent en trois étapes',agentSteps:['Ouvrez le catalogue d’agents kywai et choisissez « Ajouter ».','L’assistant vous guide dans « Programmes » et « Sessions ».','Terminez l’installation et la connexion avec votre propre compte.'],agentNote:'Comptes, prérequis et compatibilité dépendent du fournisseur. Cloud possède son propre parcours de connexion.',
  themesTitle:'Un espace qui vous ressemble.',themesIntro:'Des mondes, couleurs et décors pour votre façon de travailler.',themeGroups:['Tous','Mondes','Ville numérique','Décors','Bureau'],options:'options',preview:'Voir le thème',themeNote:'Miniatures du mode Démo de l’application. Les couleurs de Ville numérique partagent une scène ; Bureau propose jour et nuit.',chooseTheme:'Choisissez votre thème',agentTitle:'La finition de sa peluche',agentBody:'Chaque agent kywai est une peluche en feutre. Touchez-en un dans l’espace 2D ou 3D, appuyez sur « Finition de sa peluche » et choisissez parmi 18 finitions : gélifiée, paillettes, galaxie, néon, perle, velours… Elle est la même dans le chat, les fiches et les espaces, tout de suite et gratuitement.',agentAlt:'La fenêtre Finition de Claude, avec sa peluche en finition galaxie',chooseBody:'Dans kywai : Réglages → Général → Thème. Suivez celui du serveur ou choisissez-en un pour cet appareil.',close:'Fermer l’aperçu',prev:'Précédent',next:'Suivant',texture:'Textures d’Órbita',
  devicesTitle:'Votre projet, où que vous soyez.',devicesIntro:'Commencez sur ordinateur. Continuez dans le navigateur ou emportez l’équipe avec Órbita.',deviceNames:['Bureau','Navigateur','Client distant','Órbita · Android'],deviceBodies:['Windows, macOS et Linux. Le moteur et les fichiers sur la machine choisie.','Ouvrez votre espace sur un autre appareil sans application iOS.','Un autre ordinateur se connecte à votre serveur pour poursuivre le projet.','Chat, fichiers et tâches sur téléphone ou tablette Android.'],deviceActions:['Télécharger pour ordinateur','Découvrir Cloud','Guide de connexion','Télécharger Órbita'],routes:'Deux façons de rester connecté',self:'Sur votre équipement',selfBody:'Gardez votre serveur allumé et connecté. Configurez l’accès distant si nécessaire.',cloud:'Dans kywai Cloud',cloudBody:'Serveur opérationnel 24 h/24 et 7 j/7, sans tunnel à configurer. Pilote privé.',yourDevices:'Vos appareils',yourServer:'Votre ordinateur / serveur',cloudServer:'Serveur kywai Cloud',download:'Voir les téléchargements',pricing:'Comparer les offres',demoNote:'Captures de démonstration de kywai et Órbita.',
  howTitle:'De votre idée au travail en équipe.',howIntro:"Un agent ou plusieurs. Vous choisissez lesquels utiliser et qui coordonne.",example:'Exemple illustratif d’un parcours',request:'Crée un prototype web à partir de ce brief.',brief:'Brief',plan:'Plan partagé',design:'Conception',code:'Code',research:'Recherche',approve:'Vous examinez le plan',inParallel:'Travail en parallèle',review:'Vérification',files:'Fichiers du projet',result:'Résultat',howEnd:'Le plan, les avancées et les fichiers au même endroit.',video:'Voir la démo de 30 secondes',step:'Étape',noResults:'Aucun résultat avec ce filtre.',
 },
 zh:{
  hermesSummary:"具备记忆、工具与自动化能力的智能体。",codexSummary:'编程、终端任务与原型制作。',agentsTitle:'选择与你协作的伙伴。',agentsIntro:"一个或多个智能体，由你决定使用哪些、使用多少，以及由谁协调。",own:"智能体示例。由你选择连接哪些，以及使用多少。",catalog:'探索目录',filters:['全部','原生适配器','终端 / CLI','本地模型'],search:'搜索智能体',account:'账户与连接',official:'智能体文档',desktop:'桌面版目录',localTitle:'也支持你的本地模型。',localBody:'使用设备上已下载的模型连接 LM Studio 或 Ollama。',localAccount:'需要相应程序和正在运行的本地模型。',agentSetup:'三步添加智能体',agentSteps:['打开 kywai 智能体目录并选择“添加”。','向导会带你完成“程序”和“会话”步骤。','使用自己的账户完成安装与连接。'],agentNote:'账户、要求和兼容性取决于服务商。Cloud 有独立的连接流程。',
  themesTitle:'让工作空间更像你。',themesIntro:'用世界、配色和场景打造自己的工作方式。',themeGroups:['全部','世界','数字城市','装饰场景','办公室'],options:'种选项',preview:'查看主题',themeNote:'来自应用演示模式的缩略图。数字城市配色共享同一场景；办公室包含日间和夜间。',chooseTheme:'选择你的主题',agentTitle:'给公仔选质感',agentBody:'kywai 的每个智能体都是一个毛毡公仔。在 2D 或 3D 空间里点一个，按“公仔质感”，从 18 种质感中选择：软糖、亮片、星系、霓虹、珍珠、天鹅绒……在聊天、卡片和空间中都一样，即时生效且免费。',agentAlt:'Claude 的质感窗口，公仔为星系质感',chooseBody:'在 kywai 中打开设置 → 通用 → 主题。可跟随服务器主题，也可为该设备选择专属主题。',close:'关闭预览',prev:'上一个',next:'下一个',texture:'Órbita 纹理',
  devicesTitle:'项目随你同行。',devicesIntro:'从电脑开始，在浏览器中继续，或通过 Órbita 随身使用团队。',deviceNames:['桌面','浏览器','远程客户端','Órbita · Android'],deviceBodies:['支持 Windows、macOS 和 Linux，在你选择的设备上运行引擎和文件。','无需安装 iOS 应用，即可在其他设备的浏览器中打开空间。','另一台电脑连接服务器，继续同一个项目。','在 Android 手机或平板上查看聊天、文件和任务。'],deviceActions:['下载桌面版','了解 Cloud','连接指南','下载 Órbita'],routes:'两种连接方式',self:'在自己的设备上',selfBody:'保持服务器开机并联网，按需配置远程访问。',cloud:'在 kywai Cloud 中',cloudBody:'服务器全天候运行，无需配置隧道，目前处于私密试用阶段。',yourDevices:'你的设备',yourServer:'你的电脑 / 服务器',cloudServer:'kywai Cloud 服务器',download:'查看下载',pricing:'比较方案',demoNote:'kywai 与 Órbita 的演示截图。',
  howTitle:'从想法到团队协作。',howIntro:"一个或多个智能体，由你决定使用哪些、使用多少，以及由谁协调。",example:'示意工作流程',request:'根据这份需求说明创建网页原型。',brief:'需求说明',plan:'共享计划',design:'设计',code:'代码',research:'研究',approve:'由你审阅计划',inParallel:'并行工作',review:'审查',files:'项目文件',result:'成果',howEnd:'计划、进展和文件集中于同一个空间。',video:'观看 30 秒演示',step:'步骤',noResults:'该筛选条件下暂无结果。',
 },
 hi: {
   "hermesSummary": "मेमोरी, टूल और ऑटोमेशन वाला एक एजेंट।",
   "codexSummary": "प्रोग्रामिंग, टर्मिनल का काम और प्रोटोटाइप।",
   "agentsTitle": "चुनें कि आपके साथ कौन काम करे।",
   "agentsIntro": "एक एजेंट या कई। आप चुनते हैं कि कौन-से इस्तेमाल हों और समन्वय कौन करे।",
   "own": "उदाहरण एजेंट। चुनें कि कौन-से जोड़ने हैं और कितने इस्तेमाल करने हैं।",
   "catalog": "कैटलॉग देखें",
   "filters": [
    "सभी",
    "नेटिव एडैप्टर",
    "टर्मिनल / CLI",
    "लोकल मॉडल"
   ],
   "search": "एजेंट खोजें",
   "account": "खाता और कनेक्शन",
   "official": "एजेंट के दस्तावेज़",
   "desktop": "डेस्कटॉप कैटलॉग",
   "localTitle": "आपके लोकल मॉडल की भी यहीं जगह है।",
   "localBody": "अपनी मशीन पर डाउनलोड किए मॉडल के साथ LM Studio या Ollama जोड़ें।",
   "localAccount": "प्रोग्राम और चल रहा लोकल मॉडल चाहिए।",
   "agentSetup": "तीन कदमों में एजेंट जोड़ें",
   "agentSteps": [
    "kywai का एजेंट कैटलॉग खोलें और “जोड़ें” चुनें।",
    "विज़ार्ड आपको “प्रोग्राम” और “सेशन” से होकर ले जाता है।",
    "अपने खाते से इंस्टॉलेशन और कनेक्शन पूरा करें।"
   ],
   "agentNote": "खाते, ज़रूरतें और संगतता हर प्रदाता पर निर्भर करती हैं। Cloud का अपना कनेक्शन तरीका है।",
   "themesTitle": "ऐसा वर्कस्पेस जो आपका अपना लगे।",
   "themesIntro": "आपके काम करने के तरीके के लिए दुनियाएँ, रंग और माहौल।",
   "themeGroups": [
    "सभी",
    "दुनियाएँ",
    "डिजिटल शहर",
    "नज़ारे",
    "दफ़्तर"
   ],
   "options": "विकल्प",
   "preview": "थीम देखें",
   "themeNote": "ऐप के डेमो मोड की झलकियाँ। डिजिटल शहर के रंग एक ही दृश्य साझा करते हैं; दफ़्तर में दिन और रात दोनों हैं।",
   "chooseTheme": "अपनी थीम चुनें",
   "agentTitle": "आपके प्लश की फ़िनिश",
   "agentBody": "kywai का हर एजेंट फ़ेल्ट का एक प्लश खिलौना है। 2D या 3D स्पेस में किसी एक पर टैप करें, «प्लश की फ़िनिश» दबाएँ और 18 फ़िनिश में से चुनें: गमी, ग्लिटर, गैलेक्सी, नियॉन, पर्ल, वेलवेट… यह चैट, कार्ड और स्पेस में एक जैसा दिखता है, तुरंत और मुफ़्त।",
   "agentAlt": "Claude की फ़िनिश विंडो, उसका प्लश गैलेक्सी फ़िनिश में",
   "chooseBody": "kywai में: Settings → General → Theme। सर्वर की थीम अपनाएँ या इस डिवाइस के लिए एक चुनें।",
   "close": "झलक बंद करें",
   "prev": "पिछला",
   "next": "अगला",
   "texture": "Orbit के टेक्सचर",
   "devicesTitle": "आपका प्रोजेक्ट, आप जहाँ भी हों।",
   "devicesIntro": "अपने कंप्यूटर पर शुरू करें। ब्राउज़र में जारी रखें या Órbita में अपनी टीम साथ ले जाएँ।",
   "deviceNames": [
    "डेस्कटॉप",
    "ब्राउज़र",
    "रिमोट क्लाइंट",
    "Órbita · Android"
   ],
   "deviceBodies": [
    "Windows, macOS और Linux। इंजन और फ़ाइलें आपकी चुनी हुई मशीन पर चलते हैं।",
    "बिना iOS ऐप इंस्टॉल किए किसी दूसरे डिवाइस से अपना स्पेस खोलें।",
    "एक दूसरा कंप्यूटर आपके सर्वर से जुड़कर वही प्रोजेक्ट जारी रखता है।",
    "आपके Android फ़ोन या टैबलेट पर चैट, फ़ाइलें और काम।"
   ],
   "deviceActions": [
    "डेस्कटॉप डाउनलोड करें",
    "Cloud देखें",
    "कनेक्शन गाइड",
    "Órbita डाउनलोड करें"
   ],
   "routes": "जुड़े रहने के दो तरीके",
   "self": "आपके उपकरण पर",
   "selfBody": "अपना सर्वर चालू और ऑनलाइन रखें। ज़रूरत हो तो रिमोट एक्सेस सेट करें।",
   "cloud": "kywai Cloud में",
   "cloudBody": "24/7 चलने वाला सर्वर और बिना टनल सेट किए एक्सेस। निजी पायलट।",
   "yourDevices": "आपके डिवाइस",
   "yourServer": "आपका कंप्यूटर / सर्वर",
   "cloudServer": "kywai Cloud सर्वर",
   "download": "डाउनलोड देखें",
   "pricing": "प्लान की तुलना करें",
   "demoNote": "kywai और Órbita के डेमो स्क्रीनशॉट।",
   "howTitle": "आपके विचार से टीमवर्क तक।",
   "howIntro": "एक एजेंट या कई। आप चुनते हैं कि कौन-से इस्तेमाल हों और समन्वय कौन करे।",
   "example": "काम करने के तरीके का उदाहरण",
   "request": "इस ब्रीफ़ से एक वेब प्रोटोटाइप बनाओ।",
   "brief": "ब्रीफ़",
   "plan": "साझा योजना",
   "design": "डिज़ाइन",
   "code": "कोड",
   "research": "खोज",
   "approve": "आप योजना की समीक्षा करते हैं",
   "inParallel": "समानांतर काम",
   "review": "समीक्षा",
   "files": "प्रोजेक्ट फ़ाइलें",
   "result": "नतीजा",
   "howEnd": "योजना, प्रगति और फ़ाइलें, सब एक जगह।",
   "video": "30 सेकंड का डेमो देखें",
   "step": "कदम",
   "noResults": "इस फ़िल्टर के लिए कोई नतीजा नहीं।"
 },
}

const ROBOTS={hermes:'hermes',claude:'claude',codex:'codex',gemini:'gemini',muse:'muse','qwen-code':'qwen'}
export function renderVisual(id,{s,t,data,lang,base,url,esc,marks}) {
 const intro=(title,body,extra='')=>`<section class="page-intro visual-intro"><div class="wrap"><p class="eyebrow">kywai</p><h1>${esc(title)}</h1><p class="lede">${esc(body)}</p>${extra}</div></section>`
 const ctas=()=>`<div class="showcase-cta"><a class="btn btn-primary" href="${url('descargas')}">${esc(s.download)} →</a><a class="text-link" href="${url('precios')}">${esc(s.pricing)} →</a></div>`
 const official=(id,name)=>{const mark=marks.find(m=>m.id===id);if(!mark)throw new Error('Falta logo oficial: '+id);return `<img class="agent-official-logo" src="${base}${mark.path.replace(/^web\//,'')}" alt="${esc(name)}" width="64" height="64" loading="lazy">`}
 const robot=(id,name,cls='')=>`<img class="${cls}" src="${base}assets/robots/${ROBOTS[id]||id}.png" alt="${esc(name)}" width="190" height="190" loading="lazy">`
 if(id==='agentes') {
  const models=[{id:'lmstudio',name:'LM Studio',kind:'local',text:{[lang]:{summary:s.localBody,account:s.localAccount}}},{id:'ollama',name:'Ollama',kind:'local',text:{[lang]:{summary:s.localBody,account:s.localAccount}}}]
  const catalog=[...data.agents,...models]
  const hero=`<div class="agent-cast" aria-label="${esc(s.desktop)}">${data.agents.filter(a=>ROBOTS[a.id]).map(a=>`<div>${official(a.id,a.name)}<span>${esc(a.name)}</span></div>`).join('')}</div>`
  const filters=['all','builtin','cli','local']
  const cards=catalog.map(a=>`<article class="agent-catalog-card" data-agent-category="${a.kind}" data-agent-name="${esc(a.name.toLowerCase())}"><div class="agent-card-top"><span class="agent-portrait">${official(a.id,a.name)}</span><div><h2>${esc(a.name)}</h2><span class="agent-kind">${esc(s.filters[filters.indexOf(a.kind)])}</span></div></div><p>${esc(a.id==='codex'?s.codexSummary:a.id==='hermes'?s.hermesSummary:a.text[lang].summary)}</p><details><summary>${esc(s.account)}</summary><p>${esc(a.text[lang].account)}</p>${a.docs?`<a class="text-link" href="${esc(a.docs)}" target="_blank" rel="noopener noreferrer">${esc(s.official)} →</a>`:''}</details></article>`).join('')
  return intro(s.agentsTitle,s.agentsIntro,`<p class="visual-note">${esc(s.own)}</p><a class="text-link visual-guide-link" href="#agent-setup">${esc(s.agentSetup)} →</a>${hero}`)+`<section class="visual-page"><div class="wrap"><div class="visual-toolbar"><div class="visual-filters" role="group" aria-label="${esc(s.catalog)}">${s.filters.map((name,i)=>`<button type="button" data-agent-filter="${filters[i]}" aria-pressed="${i===0}">${esc(name)}</button>`).join('')}</div><input type="search" class="agent-search" data-agent-search placeholder="${esc(s.search)}" aria-label="${esc(s.search)}"></div><div class="agent-catalog-grid">${cards}</div><p class="agent-empty" hidden>${esc(s.noResults)}</p><aside class="agent-setup" id="agent-setup"><h2>${esc(s.agentSetup)}</h2><ol>${s.agentSteps.map(v=>`<li>${esc(v)}</li>`).join('')}</ol><p>${esc(s.agentNote)}</p></aside>${ctas()}</div></section>`
 }
 if(id==='temas') {
  const groups=['all','world','city','decor','office']
  const cards=data.themes.map(theme=>`<article class="theme-gallery-card" data-theme-category="${theme.group}"><a href="${base}assets/galeria/${theme.id}.webp" data-theme-preview="${theme.id}" aria-label="${esc(s.preview+' · '+theme.text[lang].name)}"><img src="${base}assets/galeria/${theme.id}.webp" alt="${esc(theme.text[lang].name)}" width="360" height="225" loading="lazy"><span class="theme-view-icon" aria-hidden="true">${icon('expand')}</span></a><div><span>${esc(s.themeGroups[groups.indexOf(theme.group)])}</span><h2>${esc(theme.text[lang].name)}</h2><p>${esc(theme.text[lang].hint)}</p></div></article>`).join('')
  return intro(s.themesTitle,s.themesIntro,`<a class="text-link visual-guide-link" href="#theme-choice">${esc(s.chooseTheme)} →</a><div class="theme-hero-strip"><img src="${base}assets/img/mundos/tema-submarino.png" alt="${esc(data.themes.find(x=>x.id==='submarino').text[lang].name)}" width="800" height="450"><div><strong>${data.themes.length}</strong><span>${esc(s.options)}</span><div class="theme-mini-strip">${['kywai','oficina','mundo-bosque'].map(id=>`<img src="${base}assets/galeria/${id}.webp" alt="${esc(data.themes.find(x=>x.id===id).text[lang].name)}" width="360" height="225" loading="lazy">`).join('')}</div></div></div>`)+`<section class="visual-page"><div class="wrap"><div class="visual-filters theme-filters" role="group" aria-label="${esc(t['themes.title'])}">${s.themeGroups.map((name,i)=>`<button type="button" data-theme-filter="${groups[i]}" aria-pressed="${i===0}">${esc(name)} <small>${i?data.themes.filter(x=>x.group===groups[i]).length:data.themes.length}</small></button>`).join('')}</div><div class="complete-theme-grid">${cards}</div><p class="visual-note">${esc(s.themeNote)}</p><aside class="theme-choice" id="theme-choice"><h2>${esc(s.chooseTheme)}</h2><p>${esc(s.chooseBody)}</p></aside><section class="agent-maker agent-finish" id="acabado-peluche"><div><span class="eyebrow">kywai</span><h2>${esc(s.agentTitle)}</h2><p>${esc(s.agentBody)}</p></div><img src="${base}assets/img/recorrido/${lang==='es'?'es':'en'}/peluches.webp" alt="${esc(s.agentAlt)}" width="956" height="560" loading="lazy"></section><p class="theme-credits">${esc(s.texture)}: <a href="https://www.solarsystemscope.com/textures/">Solar System Scope</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · <a href="https://svs.gsfc.nasa.gov/4720/">NASA SVS</a></p>${ctas()}</div></section><dialog class="theme-preview-dialog" aria-labelledby="theme-dialog-title"><form method="dialog"><button class="video-close" aria-label="${esc(s.close)}">×</button></form><div class="theme-preview-content"><img src="${base}assets/galeria/kywai.webp" width="360" height="225" alt=""><div><span class="eyebrow" data-theme-group></span><h2 id="theme-dialog-title" data-theme-title></h2><p data-theme-hint></p><small>${esc(s.themeNote)}</small></div></div><div class="theme-preview-controls"><button type="button" data-theme-prev>← ${esc(s.prev)}</button><button type="button" data-theme-next>${esc(s.next)} →</button></div></dialog>`
 }
 if(id==='dispositivos') {
  const desktop=`<div class="hardware-desktop"><div><span class="hardware-dots" aria-hidden="true">● ● ●</span><img src="${base}assets/img/${lang}/escritorio.jpg" alt="${esc(t['hero.shotAlt'])}" width="1600" height="900"></div><i aria-hidden="true"></i></div>`
  const phone=`<div class="hardware-phone"><img src="${base}assets/img/movil-chat.jpg" alt="${esc(t['anywhere.phoneAlt1'])}" width="460" height="727"></div>`
  const arts=[desktop,`<div class="device-browser-art"><div class="browser-address">${icon('globe')}<span>kywai</span></div><img src="${base}assets/img/${lang}/escritorio.jpg" alt="${esc(t['hero.shotAlt'])}" width="1600" height="900" loading="lazy"></div>`,`<div class="device-client-art" aria-hidden="true">${icon('monitor')}<span>${icon('arrow')}</span>${icon('cloud')}</div>`,phone]
  const actions=[url('descargas'),url('cloud'),'https://github.com/Yiku21/kywai/blob/master/docs/MANUAL.md#cliente-de-escritorio-conectar-con-tu-kywai-principal',url('descargas','#android')]
  return intro(s.devicesTitle,s.devicesIntro,`<div class="device-fleet">${desktop}${phone}<div class="fleet-orbit"><img src="${base}assets/kywai-simbolo.svg" alt="kywai" width="70" height="70"></div></div><p class="visual-note">${esc(s.demoNote)}</p>`)+`<section class="visual-page" id="anywhere"><div class="wrap"><div class="device-options">${s.deviceNames.map((name,i)=>`<article><div class="device-option-art">${arts[i]}</div><h2>${esc(name)}</h2><p>${esc(s.deviceBodies[i])}</p><a class="text-link" href="${actions[i]}">${esc(s.deviceActions[i])} →</a></article>`).join('')}</div><section class="device-routes"><h2>${esc(s.routes)}</h2><div>${[[s.self,s.selfBody,s.yourServer,'monitor'],[s.cloud,s.cloudBody,s.cloudServer,'cloud']].map(([title,body,server,key])=>`<article><div class="route-illustration" aria-hidden="true"><span>${icon('phone')}${icon('monitor')}</span><b>→</b>${icon(key)}</div><div class="route-labels"><span>${esc(s.yourDevices)}</span><span>${esc(server)}</span></div><h3>${esc(title)}</h3><p>${esc(body)}</p></article>`).join('')}</div></section><p class="visual-note">${esc(s.demoNote)}</p>${ctas()}</div></section>`
 }
 if(id==='como') {
  const avatars=`<div class="walk-agents">${[['gemini','Gemini'],['claude','Claude'],['codex','Codex']].map(([id,name])=>`<div>${robot(id,name)}<span>${name}</span></div>`).join('')}</div>`
  const art=[`<div class="walk-message"><span>${icon('message')}</span><p>${esc(s.request)}</p><div>${icon('file')} ${esc(s.brief)}.pdf</div></div>`,`<div class="walk-plan"><div><img src="${base}assets/kywai-simbolo.svg" alt="kywai" width="64" height="64"><strong>${esc(s.plan)}</strong></div>${[s.research,s.design,s.code].map((v,i)=>`<p><span>0${i+1}</span>${esc(v)}${icon('arrow')}</p>`).join('')}</div>`,`<div class="walk-approve">${icon('check')}<strong>${esc(s.approve)}</strong><div>${icon('sliders')}${icon('message')}${icon('check')}</div></div>`,`<div class="walk-parallel"><p>${esc(s.inParallel)}</p>${avatars}<div class="walk-packets" aria-hidden="true"><i></i><i></i><i></i></div></div>`,`<div class="walk-result"><span class="walk-review">${icon('check')} ${esc(s.review)}</span><div>${icon('code')}${icon('file')}${icon('folder')}</div><strong>${esc(s.files)}</strong></div>`]
  const stepIcons=['message','team','check','clock','folder']
  return intro(s.howTitle,s.howIntro)+`<section class="visual-page" id="how"><div class="wrap"><div class="walkthrough-layout"><div class="walkthrough-tabs" role="tablist" aria-label="${esc(s.howTitle)}" aria-orientation="vertical">${stepIcons.map((key,i)=>`<a href="#walk-panel-${i}" role="tab" id="walk-tab-${i}" aria-controls="walk-panel-${i}" aria-selected="${i===0}" tabindex="${i===0?'0':'-1'}"><span>${icon(key)}</span><small>0${i+1}</small><strong>${esc(t['how.s'+(i+1)+'t'])}</strong></a>`).join('')}</div><div class="walkthrough-panels">${art.map((v,i)=>`<article role="tabpanel" id="walk-panel-${i}" aria-labelledby="walk-tab-${i}" tabindex="0"><p class="eyebrow">${esc(s.example)}</p><div class="walk-illustration">${v}</div><div class="walk-caption"><span>${esc(s.step)} ${i+1} / 5</span><h2>${esc(t['how.s'+(i+1)+'t'])}</h2><p>${esc(t['how.s'+(i+1)+'b'])}</p></div></article>`).join('')}<div class="walk-controls" hidden><button type="button" data-walk-prev>← ${esc(s.prev)}</button><button type="button" data-walk-next>${esc(s.next)} →</button></div></div></div><div class="walk-ending" id="ideas"><h2>${esc(s.howEnd)}</h2><img src="${base}assets/img/${lang}/escritorio.jpg" alt="${esc(t['hero.shotAlt'])}" width="1600" height="900" loading="lazy"><p class="visual-note">${esc(s.demoNote)}</p><a class="btn btn-primary" href="${base}assets/video/presentacion.mp4">${icon('video')}${esc(s.video)}</a></div>${ctas()}</div></section>`
 }
 return ''
}
