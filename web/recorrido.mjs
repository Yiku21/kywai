// Portada: recorrido por las pantallas de kywai (capturas reales) y franja «Lo nuevo» (tarjetas hasta NOVEDADES_HASTA).
// Las capturas viven en assets/img/recorrido/<es|en>/ (el resto de idiomas usa las inglesas); las de SOLO_ES son de la app
// instalada y solo existen en español. «estudio» y «ordenador» son tarjetas HTML (no salen en el modo demo) y Órbita usa
// assets/img/movil-chat.jpg. Todos los agentes salen como peluches, el estilo de kywai desde la 1.26.4.
import { readFileSync } from 'node:fs'
// El sello de la portada sale de la versión que se descarga (descargas.json lo pone al día solo cada día): ya no se queda fija.
const _descargas = JSON.parse(readFileSync(new URL('./descargas.json', import.meta.url), 'utf8'))
export const VERSION_WEB = (_descargas.assets.map(a => /kywai-(\d+\.\d+)\.\d+/.exec(a.name)?.[1]).find(Boolean)) || '1.35'
// «Lo nuevo» se escribe a mano: hasta qué versión llegan las tarjetas de abajo (al subirla, repasa también las tarjetas).
export const NOVEDADES_HASTA = '1.35'
export const PANTALLAS = ['chat', 'peluches', '3d', '2d', 'tablero', 'miniaturas', 'estudio', 'conectores', 'ordenador', 'temas', 'nube', 'orbita']
const SOLO_ES = ['miniaturas', 'conectores']
const ENTERAS = ['peluches', 'miniaturas', 'conectores']

export const RECORRIDO = {
  es: {
    badge: 'Ya disponible', badgeMore: 'Mira lo nuevo',
    kicker: 'kywai por dentro', title: 'Todas sus pantallas, en un minuto.', note: 'Capturas reales de la app, con agentes simulados.', pause: 'Pausar el recorrido', play: 'Seguir el recorrido',
    tabs: [
      ['Chat y coordinador', 'Escribe una tarea. kywai / Hermes la divide, se la da a cada agente según lo que hace mejor y te enseña el plan en marcha.', ['Plan', 'Archivos', 'Voz']],
      ['Peluches y acabados', 'Cada agente es un peluche de fieltro. Elige su acabado (galaxia, neón, perla y 15 más) y se ve igual en el chat, las fichas, el 2D y el 3D.', ['18 acabados', 'Sorpréndeme', 'Gratis']],
      ['Espacio 3D', 'Ves a tu equipo trabajar: quién tiene cada tarea, a quién espera y qué acaba de entregar.', ['Avisos en vivo', 'Música', 'Pantalla completa']],
      ['Espacio 2D', 'El mismo equipo dibujado, ligero para cualquier ordenador. Cuatro escenas: Flujo, Mesa, Aldea y Tren.', ['Sin tarjeta gráfica', '4 escenas']],
      ['Tablero', 'Deja tareas en «Por hacer» y el equipo las va moviendo hasta «Hecho». Lo que espera tu sí sale aparte.', ['Por hacer', 'Te espera', 'Hecho']],
      ['Chat con miniaturas', 'Lo que entrega un agente sale como miniatura: imagen, vídeo o PDF. Un clic lo abre en grande y la flecha lo descarga.', ['PNG', 'MP4', 'PDF']],
      ['Estudio y reels', 'Vídeos, voces, imágenes y reels desde el chat. «/crecer» prepara una tanda de reels, la revisas en una rejilla y salen solos a su mejor hora.', ['/video', '/crecer', 'Película de producto', 'Mapa de reels']],
      ['Conectores', 'Tus apps con su estado y un clic para conectarlas: Gmail, GitHub, Notion y 1.740 más. Tú decides si solo leen o también pueden actuar.', ['1.740 apps', 'Puede actuar', 'Sin contraseñas']],
      ['Tu ordenador', 'Tus agentes usan los programas de tu PC: leen cada botón por su nombre, lo ves en vivo y lo paras cuando quieras. También desde la web o el móvil.', ['En vivo', 'Parar', 'Desde el móvil']],
      ['Temas', 'Cambia el aspecto de toda la app y del mundo de tus agentes, de claro a neón.', ['Perla', 'Esmeralda', 'Neón', 'Frost Glass']],
      ['kywai Cloud', 'Tu kywai encendido las 24 horas en el navegador, con Mi cuenta para tus agentes, tu consumo y tus créditos.', ['24/7', 'Mi cuenta', 'Créditos']],
      ['Órbita en el móvil', 'Tu equipo en Android: escribe una tarea, mira el mundo y recibe los resultados.', ['Android', 'Avisos']],
    ],
    studio: [['/video', 'un vídeo de 30 s para presentar la tienda'], ['/crecer', '20 reels para que nos descubra gente nueva'], ['/video', 'película de producto de mi app, con estas capturas']],
    engines: 'Generar con', engineNames: ['Mi ChatGPT', 'Modelos locales', 'Nube'], studioNote: 'Ejemplos de órdenes del estudio.',
    pc: { title: 'Claude está usando tu ordenador', step: 'Escribiendo «Lista de la compra» en el Bloc de notas…', stop: 'Parar', note: 'Ejemplo de lo que ves mientras un agente usa tu PC.' },
    newKicker: 'Lo nuevo hasta la {v}', newTitle: 'Lo último que ha llegado a kywai.', allNotes: 'Todas las notas de la versión',
    news: [
      ['Ventanas a tu medida', 'Estira Ajustes y las demás ventanas desde cualquier borde o maximízalas; cada una recuerda su tamaño.'],
      ['Pulsar para hablar', 'En «Hablar con kywai» solo te oye mientras mantienes F8 (o la tecla que elijas), también con kywai en segundo plano.'],
      ['Música con ytm-rs y letras', 'YouTube Music sin anuncios, manejado desde kywai, con la letra como un karaoke y traducida a tu idioma.'],
      ['Amigos que suenan', 'Cuando un amigo te escribe, el número late, suena una marimba propia y sale un aviso del sistema con su nombre.'],
      ['«/diseno» y «/juego»', 'Diseños sin «cara de IA» y juegos pequeños que el agente prueba jugando antes de dártelos.'],
      ['Más fluido y ligero', 'El 3D ya no da tirones, kywai abre antes y la descarga pesa unos 20 MB menos.'],
    ],
    newMore: 'Y además: en kywai Cloud, Hermes usa primero tu Claude o tu ChatGPT; «Pasar a kywai cloud» aguanta muchísimos archivos; «comenta la palabra y te mando el enlace» en Instagram; «/seo» y «/marketing».',
  },
  en: {
    badge: 'Out now', badgeMore: 'See what’s new',
    kicker: 'Inside kywai', title: 'Every screen, in one minute.', note: 'Real app screenshots, with simulated agents.', pause: 'Pause the tour', play: 'Resume the tour',
    tabs: [
      ['Chat and coordinator', 'Write a task. kywai / Hermes splits it, gives each agent what it does best and shows you the plan as it runs.', ['Plan', 'Files', 'Voice']],
      ['Plushies and finishes', 'Every agent is a felt plushie. Pick its finish (galaxy, neon, pearl and 15 more) and it looks the same in the chat, the cards, 2D and 3D.', ['18 finishes', 'Surprise me', 'Free']],
      ['3D space', 'Watch your team work: who has each task, who they are waiting for and what they just delivered.', ['Live updates', 'Music', 'Full screen']],
      ['2D space', 'The same team, drawn and light enough for any computer. Four scenes: Flow, Desk, Village and Train.', ['No graphics card', '4 scenes']],
      ['Board', 'Drop tasks in “To do” and the team moves them to “Done”. Anything waiting for your OK is set apart.', ['To do', 'Waiting on you', 'Done']],
      ['Chat thumbnails', 'What an agent delivers shows up as a thumbnail: image, video or PDF. One click opens it large and the arrow downloads it.', ['PNG', 'MP4', 'PDF']],
      ['Studio and reels', 'Videos, voices, images and reels from the chat. “/crecer” prepares a batch of reels, you review it in a grid and they post themselves at their best time.', ['/video', '/crecer', 'Product film', 'Reel map']],
      ['Connectors', 'Your apps with their status and one click to connect them: Gmail, GitHub, Notion and 1,740 more. You decide whether they only read or can also act.', ['1,740 apps', 'Can act', 'No passwords']],
      ['Your computer', 'Your agents use the programs on your PC: they read every button by name, you watch it live and stop it whenever you want. From the web or your phone too.', ['Live', 'Stop', 'From your phone']],
      ['Themes', 'Change the look of the whole app and your agents’ world, from light to neon.', ['Pearl', 'Emerald', 'Neon', 'Frost Glass']],
      ['kywai Cloud', 'Your kywai running 24 hours a day in the browser, with My account for your agents, usage and credits.', ['24/7', 'My account', 'Credits']],
      ['Órbita on your phone', 'Your team on Android: write a task, watch the world and get the results.', ['Android', 'Notifications']],
    ],
    studio: [['/video', 'a 30-second video to present the shop'], ['/crecer', '20 reels so new people discover us'], ['/video', 'product film of my app, with these screenshots']],
    engines: 'Create with', engineNames: ['My ChatGPT', 'Local models', 'Cloud'], studioNote: 'Example studio commands.',
    pc: { title: 'Claude is using your computer', step: 'Typing “Shopping list” in Notepad…', stop: 'Stop', note: 'Example of what you see while an agent uses your PC.' },
    newKicker: 'New up to {v}', newTitle: 'The latest additions to kywai.', allNotes: 'All release notes',
    news: [
      ['Windows your size', 'Stretch Settings and the other windows from any edge or maximize them; each one remembers its size.'],
      ['Push to talk', 'In “Talk to kywai” it only hears you while you hold F8 (or the key you choose), even when kywai is in the background.'],
      ['Music with ytm-rs and lyrics', 'Ad-free YouTube Music controlled from kywai, with karaoke-style lyrics translated into your language.'],
      ['Friends you can hear', 'When a friend writes, the number pulses, a marimba of its own plays and a system alert shows their name.'],
      ['“/design” and “/game”', 'Designs without the “AI look” and small games the agent plays to test before handing them over.'],
      ['Smoother and lighter', 'The 3D no longer stutters, kywai opens sooner and the download is about 20 MB smaller.'],
    ],
    newMore: 'Also: in kywai Cloud, Hermes now uses your Claude or ChatGPT first; “Move to kywai Cloud” copes with huge numbers of files; “comment the word and I’ll send the link” on Instagram; “/seo” and “/marketing”.',
  },
  pt: {
    badge: 'Já disponível', badgeMore: 'Veja as novidades',
    kicker: 'kywai por dentro', title: 'Todas as telas, em um minuto.', note: 'Capturas reais do app, com agentes simulados.', pause: 'Pausar o tour', play: 'Continuar o tour',
    tabs: [
      ['Chat e coordenador', 'Escreva uma tarefa. kywai / Hermes a divide, entrega a cada agente o que ele faz melhor e mostra o plano em andamento.', ['Plano', 'Arquivos', 'Voz']],
      ['Pelúcias e acabamentos', 'Cada agente é uma pelúcia de feltro. Escolha o acabamento (galáxia, neon, pérola e mais 15) e ele aparece igual no chat, nas fichas, no 2D e no 3D.', ['18 acabamentos', 'Surpreenda-me', 'Grátis']],
      ['Espaço 3D', 'Veja sua equipe trabalhar: quem tem cada tarefa, por quem espera e o que acabou de entregar.', ['Avisos ao vivo', 'Música', 'Tela cheia']],
      ['Espaço 2D', 'A mesma equipe desenhada, leve para qualquer computador. Quatro cenas: Fluxo, Mesa, Aldeia e Trem.', ['Sem placa de vídeo', '4 cenas']],
      ['Quadro', 'Deixe tarefas em «A fazer» e a equipe as leva até «Feito». O que espera o seu sim fica à parte.', ['A fazer', 'Espera por você', 'Feito']],
      ['Chat com miniaturas', 'O que um agente entrega aparece como miniatura: imagem, vídeo ou PDF. Um clique abre em grande e a seta baixa.', ['PNG', 'MP4', 'PDF']],
      ['Estúdio e reels', 'Vídeos, vozes, imagens e reels no chat. «/crecer» prepara um lote de reels, você revisa numa grade e eles saem sozinhos no melhor horário.', ['/video', '/crecer', 'Filme de produto', 'Mapa de reels']],
      ['Conectores', 'Seus apps com o status e um clique para conectar: Gmail, GitHub, Notion e mais 1.740. Você decide se só leem ou também podem agir.', ['1.740 apps', 'Pode agir', 'Sem senhas']],
      ['Seu computador', 'Seus agentes usam os programas do seu PC: leem cada botão pelo nome, você vê ao vivo e para quando quiser. Também pela web ou pelo celular.', ['Ao vivo', 'Parar', 'Pelo celular']],
      ['Temas', 'Mude o visual de todo o app e do mundo dos seus agentes, do claro ao neon.', ['Pérola', 'Esmeralda', 'Neon', 'Frost Glass']],
      ['kywai Cloud', 'Seu kywai ligado 24 horas no navegador, com Minha conta para agentes, consumo e créditos.', ['24/7', 'Minha conta', 'Créditos']],
      ['Órbita no celular', 'Sua equipe no Android: escreva uma tarefa, veja o mundo e receba os resultados.', ['Android', 'Avisos']],
    ],
    studio: [['/video', 'um vídeo de 30 s para apresentar a loja'], ['/crecer', '20 reels para gente nova nos descobrir'], ['/video', 'filme de produto do meu app, com estas capturas']],
    engines: 'Gerar com', engineNames: ['Meu ChatGPT', 'Modelos locais', 'Nuvem'], studioNote: 'Exemplos de comandos do estúdio.',
    pc: { title: 'Claude está usando seu computador', step: 'Escrevendo «Lista de compras» no Bloco de notas…', stop: 'Parar', note: 'Exemplo do que você vê enquanto um agente usa seu PC.' },
    newKicker: 'Novidades até a {v}', newTitle: 'O que acabou de chegar ao kywai.', allNotes: 'Todas as notas da versão',
    news: [
      ['Janelas do seu tamanho', 'Estique Configurações e as outras janelas por qualquer borda ou maximize-as; cada uma lembra do seu tamanho.'],
      ['Apertar para falar', 'Em “Falar com o kywai”, ele só ouve você enquanto você segura F8 (ou a tecla que escolher), também com o kywai em segundo plano.'],
      ['Música com ytm-rs e letras', 'YouTube Music sem anúncios, controlado pelo kywai, com a letra em estilo karaokê e traduzida para o seu idioma.'],
      ['Amigos que se ouvem', 'Quando um amigo escreve, o número pulsa, toca uma marimba própria e aparece um aviso do sistema com o nome dele.'],
      ['“/diseno” e “/juego”', 'Designs sem “cara de IA” e jogos pequenos que o agente testa jogando antes de entregar.'],
      ['Mais fluido e leve', 'O 3D não trava mais, o kywai abre mais rápido e o download pesa cerca de 20 MB a menos.'],
    ],
    newMore: 'E também: no kywai Cloud, o Hermes usa primeiro o seu Claude ou ChatGPT; “Passar para o kywai Cloud” aguenta muitíssimos arquivos; “comente a palavra e eu mando o link” no Instagram; “/seo” e “/marketing”.',
  },
  fr: {
    badge: 'Disponible', badgeMore: 'Voir les nouveautés',
    kicker: 'kywai de l’intérieur', title: 'Tous ses écrans, en une minute.', note: 'Captures réelles de l’app, avec des agents simulés.', pause: 'Mettre la visite en pause', play: 'Reprendre la visite',
    tabs: [
      ['Chat et coordinateur', 'Écrivez une tâche. kywai / Hermes la découpe, confie à chaque agent ce qu’il fait le mieux et montre le plan en cours.', ['Plan', 'Fichiers', 'Voix']],
      ['Peluches et finitions', 'Chaque agent est une peluche en feutre. Choisissez sa finition (galaxie, néon, perle et 15 autres) : elle est la même dans le chat, les fiches, la 2D et la 3D.', ['18 finitions', 'Surprends-moi', 'Gratuit']],
      ['Espace 3D', 'Regardez votre équipe travailler : qui a chaque tâche, qui elle attend et ce qu’elle vient de livrer.', ['En direct', 'Musique', 'Plein écran']],
      ['Espace 2D', 'La même équipe dessinée, légère pour tout ordinateur. Quatre scènes : Flux, Bureau, Village et Train.', ['Sans carte graphique', '4 scènes']],
      ['Tableau', 'Déposez des tâches dans « À faire » et l’équipe les mène jusqu’à « Fait ». Ce qui attend votre accord est à part.', ['À faire', 'Vous attend', 'Fait']],
      ['Chat avec miniatures', 'Ce qu’un agent livre s’affiche en miniature : image, vidéo ou PDF. Un clic l’ouvre en grand et la flèche le télécharge.', ['PNG', 'MP4', 'PDF']],
      ['Studio et reels', 'Vidéos, voix, images et reels depuis le chat. « /crecer » prépare une série de reels, vous la vérifiez dans une grille et ils sortent seuls à la meilleure heure.', ['/video', '/crecer', 'Film produit', 'Carte des reels']],
      ['Connecteurs', 'Vos apps avec leur état et un clic pour les connecter : Gmail, GitHub, Notion et 1 740 autres. Vous décidez s’ils lisent seulement ou peuvent aussi agir.', ['1 740 apps', 'Peut agir', 'Sans mots de passe']],
      ['Votre ordinateur', 'Vos agents utilisent les programmes de votre PC : ils lisent chaque bouton par son nom, vous regardez en direct et arrêtez quand vous voulez. Aussi depuis le web ou le mobile.', ['En direct', 'Arrêter', 'Depuis le mobile']],
      ['Thèmes', 'Changez l’apparence de toute l’app et du monde de vos agents, du clair au néon.', ['Perle', 'Émeraude', 'Néon', 'Frost Glass']],
      ['kywai Cloud', 'Votre kywai allumé 24 h/24 dans le navigateur, avec Mon compte pour vos agents, votre consommation et vos crédits.', ['24/7', 'Mon compte', 'Crédits']],
      ['Órbita sur mobile', 'Votre équipe sur Android : écrivez une tâche, regardez le monde et recevez les résultats.', ['Android', 'Notifications']],
    ],
    studio: [['/video', 'une vidéo de 30 s pour présenter la boutique'], ['/crecer', '20 reels pour que de nouvelles personnes nous découvrent'], ['/video', 'film produit de mon app, avec ces captures']],
    engines: 'Créer avec', engineNames: ['Mon ChatGPT', 'Modèles locaux', 'Cloud'], studioNote: 'Exemples de commandes du studio.',
    pc: { title: 'Claude utilise votre ordinateur', step: 'Écrit « Liste de courses » dans le Bloc-notes…', stop: 'Arrêter', note: 'Exemple de ce que vous voyez pendant qu’un agent utilise votre PC.' },
    newKicker: 'Nouveautés jusqu’à la {v}', newTitle: 'Les derniers ajouts à kywai.', allNotes: 'Toutes les notes de version',
    news: [
      ['Des fenêtres à votre taille', 'Étirez les Réglages et les autres fenêtres par n’importe quel bord ou agrandissez-les ; chacune se souvient de sa taille.'],
      ['Appuyer pour parler', 'Dans « Parler à kywai », il ne vous entend que tant que vous maintenez F8 (ou la touche de votre choix), même en arrière-plan.'],
      ['Musique avec ytm-rs et paroles', 'YouTube Music sans publicité, piloté depuis kywai, avec des paroles façon karaoké traduites dans votre langue.'],
      ['Des amis qui se font entendre', 'Quand un ami vous écrit, le chiffre pulse, un marimba bien à lui retentit et une alerte système affiche son nom.'],
      ['« /diseno » et « /juego »', 'Des designs sans « look d’IA » et de petits jeux que l’agent teste en y jouant avant de vous les remettre.'],
      ['Plus fluide et plus léger', 'La 3D ne saccade plus, kywai s’ouvre plus vite et le téléchargement pèse environ 20 Mo de moins.'],
    ],
    newMore: 'Et aussi : dans kywai Cloud, Hermes utilise d’abord votre Claude ou votre ChatGPT ; « Passer à kywai Cloud » gère un très grand nombre de fichiers ; « commentez le mot et je vous envoie le lien » sur Instagram ; « /seo » et « /marketing ».',
  },
  zh: {
    badge: '现已推出', badgeMore: '查看新功能',
    kicker: '走进 kywai', title: '一分钟看完所有界面。', note: '应用的真实截图，智能体为模拟数据。', pause: '暂停浏览', play: '继续浏览',
    tabs: [
      ['聊天与协调者', '写下一个任务。kywai / Hermes 会拆分任务，按各自所长分配给每个智能体，并实时展示计划。', ['计划', '文件', '语音']],
      ['毛绒公仔与质感', '每个智能体都是一个毛毡公仔。选一种质感（星系、霓虹、珍珠等共 18 种），在聊天、卡片、2D 和 3D 中都一样。', ['18 种质感', '给我惊喜', '免费']],
      ['3D 空间', '看着你的团队工作：谁负责哪个任务、在等谁、刚交付了什么。', ['实时提醒', '音乐', '全屏']],
      ['2D 空间', '同一个团队的手绘版本，任何电脑都能流畅运行。四个场景：流程、桌面、村庄和火车。', ['无需显卡', '4 个场景']],
      ['看板', '把任务放进“待办”，团队会一路推进到“完成”。等你确认的事项单独列出。', ['待办', '等你确认', '完成']],
      ['聊天缩略图', '智能体交付的内容以缩略图显示：图片、视频或 PDF。点一下放大，点箭头下载。', ['PNG', 'MP4', 'PDF']],
      ['工作室与短视频', '在聊天里制作视频、语音、图片和短视频。“/crecer”准备一批短视频，你在网格里检查，它们会在最佳时间自动发布。', ['/video', '/crecer', '产品影片', '短视频地图']],
      ['连接器', '你的应用及其状态，一键连接：Gmail、GitHub、Notion 等 1,740 个应用。由你决定它们只读还是可以操作。', ['1,740 个应用', '可以操作', '无需密码']],
      ['你的电脑', '你的智能体使用你电脑上的程序：按名称识别每个按钮，你可以实时观看并随时停止。也能从网页或手机操作。', ['实时', '停止', '从手机']],
      ['主题', '更换整个应用和智能体世界的外观，从浅色到霓虹。', ['珍珠', '翡翠', '霓虹', 'Frost Glass']],
      ['kywai Cloud', '你的 kywai 在浏览器中 24 小时运行，“我的账户”里管理智能体、用量和点数。', ['24/7', '我的账户', '点数']],
      ['手机上的 Órbita', '在 Android 上使用你的团队：写任务、看世界、收结果。', ['Android', '通知']],
    ],
    studio: [['/video', '做一个 30 秒的店铺介绍视频'], ['/crecer', '20 条短视频，让新的人发现我们'], ['/video', '用这些截图做我的应用的产品影片']],
    engines: '生成方式', engineNames: ['我的 ChatGPT', '本地模型', '云端'], studioNote: '工作室指令示例。',
    pc: { title: 'Claude 正在使用你的电脑', step: '正在记事本里输入“购物清单”…', stop: '停止', note: '智能体使用你的电脑时你看到的画面示例。' },
    newKicker: '截至 {v} 的新功能', newTitle: 'kywai 最新加入的功能。', allNotes: '全部版本说明',
    news: [
      ['窗口随你调大小', '设置和其他窗口可从任意边缘拖动放大，或一键最大化；每个窗口都会记住自己的大小。'],
      ['按住说话', '在“与 kywai 对话”中，只有你按住 F8（或你选的按键）时它才会收听，kywai 在后台时也一样。'],
      ['用 ytm-rs 听音乐、看歌词', '无广告的 YouTube Music 可在 kywai 里控制，歌词像卡拉 OK 一样逐字点亮，并翻译成你的语言。'],
      ['听得见的好友消息', '好友发来消息时，数字会跳动，响起专属的马林巴琴提示音，系统通知里还会显示对方的名字。'],
      ['“/diseno”和“/juego”', '没有“AI 味”的设计，以及智能体先亲自玩过再交给你的小游戏。'],
      ['更流畅、更轻巧', '3D 不再卡顿，kywai 启动更快，下载包小了约 20 MB。'],
    ],
    newMore: '此外：在 kywai Cloud 中，Hermes 会优先使用你的 Claude 或 ChatGPT；“迁移到 kywai Cloud”可处理海量文件；Instagram 上“评论关键词，我私信发你链接”；以及“/seo”和“/marketing”。',
  },
  hi: {
    badge: 'अब उपलब्ध', badgeMore: 'नया क्या है देखें',
    kicker: 'kywai के अंदर', title: 'हर स्क्रीन, एक मिनट में।', note: 'ऐप के असली स्क्रीनशॉट, सिम्युलेटेड एजेंटों के साथ।', pause: 'टूर रोकें', play: 'टूर जारी रखें',
    tabs: [
      ['चैट और कोऑर्डिनेटर', 'एक काम लिखें। kywai / Hermes उसे बाँटता है, हर एजेंट को वही देता है जो वह सबसे अच्छा करता है और चलती योजना दिखाता है।', ['योजना', 'फ़ाइलें', 'आवाज़']],
      ['प्लश खिलौने और फ़िनिश', 'हर एजेंट फ़ेल्ट का एक प्लश खिलौना है। उसकी फ़िनिश चुनें (गैलेक्सी, नियॉन, पर्ल और 15 और), और वह चैट, कार्ड, 2D और 3D में एक जैसा दिखता है।', ['18 फ़िनिश', 'चौंकाओ', 'मुफ़्त']],
      ['3D स्पेस', 'अपनी टीम को काम करते देखें: कौन सा काम किसके पास है, वह किसका इंतज़ार कर रहा है और उसने अभी क्या सौंपा।', ['लाइव सूचनाएँ', 'संगीत', 'पूरी स्क्रीन']],
      ['2D स्पेस', 'वही टीम, चित्रों में, किसी भी कंप्यूटर पर हल्की। चार दृश्य: फ़्लो, मेज़, गाँव और ट्रेन।', ['ग्राफ़िक्स कार्ड की ज़रूरत नहीं', '4 दृश्य']],
      ['बोर्ड', 'काम «करना है» में रखें और टीम उन्हें «हो गया» तक ले जाती है। आपकी मंज़ूरी वाले काम अलग दिखते हैं।', ['करना है', 'आपका इंतज़ार', 'हो गया']],
      ['चैट में थंबनेल', 'एजेंट जो सौंपता है वह थंबनेल में दिखता है: तस्वीर, वीडियो या PDF। एक क्लिक से बड़ा खुलता है और तीर से डाउनलोड होता है।', ['PNG', 'MP4', 'PDF']],
      ['स्टूडियो और रील', 'चैट से वीडियो, आवाज़, तस्वीरें और रील। «/crecer» रीलों का एक बैच बनाता है, आप उसे ग्रिड में देखते हैं और वे अपने सबसे अच्छे समय पर खुद पोस्ट होती हैं।', ['/video', '/crecer', 'प्रोडक्ट फ़िल्म', 'रील मैप']],
      ['कनेक्टर', 'आपके ऐप उनकी स्थिति के साथ और जोड़ने के लिए एक क्लिक: Gmail, GitHub, Notion और 1,740 और। आप तय करते हैं कि वे सिर्फ़ पढ़ें या काम भी कर सकें।', ['1,740 ऐप', 'काम कर सकता है', 'बिना पासवर्ड']],
      ['आपका कंप्यूटर', 'आपके एजेंट आपके PC के प्रोग्राम चलाते हैं: हर बटन को उसके नाम से पढ़ते हैं, आप लाइव देखते हैं और जब चाहें रोक देते हैं। वेब या फ़ोन से भी।', ['लाइव', 'रोकें', 'फ़ोन से']],
      ['थीम', 'पूरे ऐप और आपके एजेंटों की दुनिया का रूप बदलें, हल्के से नियॉन तक।', ['पर्ल', 'एमराल्ड', 'नियॉन', 'Frost Glass']],
      ['kywai Cloud', 'आपका kywai ब्राउज़र में 24 घंटे चालू, एजेंटों, उपयोग और क्रेडिट के लिए «मेरा खाता» के साथ।', ['24/7', 'मेरा खाता', 'क्रेडिट']],
      ['फ़ोन पर Órbita', 'Android पर आपकी टीम: काम लिखें, दुनिया देखें और नतीजे पाएँ।', ['Android', 'सूचनाएँ']],
    ],
    studio: [['/video', 'दुकान के परिचय के लिए 30 सेकंड का वीडियो'], ['/crecer', '20 रील ताकि नए लोग हमें खोजें'], ['/video', 'इन स्क्रीनशॉट से मेरे ऐप की प्रोडक्ट फ़िल्म']],
    engines: 'इससे बनाएँ', engineNames: ['मेरा ChatGPT', 'लोकल मॉडल', 'क्लाउड'], studioNote: 'स्टूडियो कमांड के उदाहरण।',
    pc: { title: 'Claude आपका कंप्यूटर चला रहा है', step: 'नोटपैड में «खरीदारी की सूची» लिख रहा है…', stop: 'रोकें', note: 'जब कोई एजेंट आपका PC चलाता है तब आप जो देखते हैं उसका उदाहरण।' },
    newKicker: '{v} तक की नई चीज़ें', newTitle: 'kywai में आई नई चीज़ें।', allNotes: 'सभी रिलीज़ नोट्स',
    news: [
      ['अपने नाप की विंडो', 'सेटिंग और बाकी विंडो को किसी भी किनारे से खींचकर बड़ा करें या मैक्सिमाइज़ करें; हर विंडो अपना आकार याद रखती है।'],
      ['दबाकर बोलें', '“kywai से बात करें” में वह तभी सुनता है जब आप F8 (या चुनी हुई कुंजी) दबाए रखते हैं, kywai बैकग्राउंड में हो तब भी।'],
      ['ytm-rs से संगीत और बोल', 'बिना विज्ञापन वाला YouTube Music, kywai से नियंत्रित, कराओके जैसे बोल के साथ जो आपकी भाषा में अनुवादित होते हैं।'],
      ['सुनाई देने वाले दोस्त', 'दोस्त के लिखने पर संख्या धड़कती है, अपनी मरिम्बा बजती है और सिस्टम सूचना में उसका नाम दिखता है।'],
      ['“/diseno” और “/juego”', 'बिना “AI वाली छाप” के डिज़ाइन, और छोटे गेम जिन्हें एजेंट खुद खेलकर परखता है, फिर आपको देता है।'],
      ['ज़्यादा सहज और हल्का', '3D अब अटकता नहीं, kywai जल्दी खुलता है और डाउनलोड लगभग 20 MB छोटा है।'],
    ],
    newMore: 'और भी: kywai Cloud में Hermes पहले आपका Claude या ChatGPT इस्तेमाल करता है; “kywai cloud में जाएँ” बहुत सारी फ़ाइलें संभालता है; Instagram पर “शब्द कमेंट करें, मैं लिंक भेज देता हूँ”; “/seo” और “/marketing”।',
  },
}

/** El recorrido de 12 pestañas y la franja «Lo nuevo». */
export function renderRecorrido({ r, lang, base, esc, releases }) {
  const carpeta = lang === 'es' ? 'es' : 'en'
  const imagen = id => id === 'orbita' ? `${base}assets/img/movil-chat.jpg` : `${base}assets/img/recorrido/${SOLO_ES.includes(id) ? 'es' : carpeta}/${id}.webp`
  const estudio = `<div class="tour-studio">${r.studio.map(([cmd, txt]) => `<p><code>${esc(cmd)}</code>${esc(txt)}</p>`).join('')}<p class="tour-engines"><span>${esc(r.engines)}</span>${r.engineNames.map(n => `<b>${esc(n)}</b>`).join('')}</p><small>${esc(r.studioNote)}</small></div>`
  const ordenador = `<div class="tour-pc"><p class="tour-pc-bar"><span aria-hidden="true"></span>${esc(r.pc.title)}</p><div class="tour-pc-screen" aria-hidden="true"><i></i><b></b></div><p class="tour-pc-step">${esc(r.pc.step)}</p><p class="tour-pc-row"><span class="tour-pc-stop">${esc(r.pc.stop)}</span><kbd>⌃⌥⎋</kbd></p><small>${esc(r.pc.note)}</small></div>`
  const alto = { orbita: 727, '3d': 816, peluches: 560, conectores: 1320, miniaturas: 800 }
  const ancho = { orbita: 460, '3d': 899, peluches: 956, conectores: 1760, miniaturas: 1520 }
  const tabs = PANTALLAS.map((id, i) => `<button type="button" role="tab" id="tour-tab-${id}" aria-controls="tour-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(r.tabs[i][0])}</button>`).join('')
  const panels = PANTALLAS.map((id, i) => {
    const [name, body, chips] = r.tabs[i]
    const shot = id === 'estudio' ? estudio : id === 'ordenador' ? ordenador : `<img src="${imagen(id)}" alt="${esc(name)}" width="${ancho[id] || 1600}" height="${alto[id] || 900}" loading="${i === 0 ? 'eager' : 'lazy'}"${i === 0 ? ' fetchpriority="high"' : ''}>`
    return `<div class="tour-panel" id="tour-${id}" role="tabpanel" aria-labelledby="tour-tab-${id}" tabindex="0"${i ? ' hidden' : ''}><div class="tour-shot tour-shot-${id}${ENTERAS.includes(id) ? ' tour-shot-entera' : ''}">${shot}</div><div class="tour-copy"><h3>${esc(name)}</h3><p>${esc(body)}</p><ul class="tour-chips">${chips.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div></div>`
  }).join('')
  const tour = `<figure class="product-tour" id="video" data-tour><div class="product-stage-bar"><span class="stage-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(r.kicker)} · ${esc(r.title)}</span><button type="button" class="tour-toggle" data-tour-toggle data-label-pause="${esc(r.pause)}" data-label-play="${esc(r.play)}" aria-label="${esc(r.pause)}" title="${esc(r.pause)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="tour-ico-pause" d="M8 5v14M16 5v14"/><path class="tour-ico-play" d="m8 5 11 7-11 7Z"/></svg></button></div><div class="tour-tabs" role="tablist" aria-label="${esc(r.kicker)}">${tabs}</div>${panels}<figcaption>${esc(r.note)}</figcaption></figure>`
  const news = `<section class="section news-section" id="novedades"><div class="wrap"><div class="section-head"><p class="eyebrow">${esc(r.newKicker.replace('{v}', NOVEDADES_HASTA))}</p><h2>${esc(r.newTitle)}</h2></div><div class="news-grid">${r.news.map(([t, b]) => `<article><h3>${esc(t)}</h3><p>${esc(b)}</p></article>`).join('')}</div><p class="news-more">${esc(r.newMore)}</p><a class="text-link" href="${releases}">${esc(r.allNotes)} <span aria-hidden="true">→</span></a></div></section>`
  const badge = `<a class="release-badge" href="#novedades"><strong>kywai ${VERSION_WEB}</strong><span>${esc(r.badge)}</span><span class="release-badge-more">${esc(r.badgeMore)} →</span></a>`
  return { tour, news, badge }
}
