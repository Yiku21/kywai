// Portada 1.0: recorrido por las pantallas de kywai (capturas reales en modo demo) y franja «Lo nuevo en la 1.0».
// Las capturas viven en assets/img/recorrido/<es|en>/ (el resto de idiomas usa las inglesas). Órbita usa assets/img/movil-chat.jpg.
export const PANTALLAS = ['chat', '3d', '2d', 'tablero', 'estudio', 'temas', 'nube', 'orbita']

export const RECORRIDO = {
  es: {
    badge: 'Ya disponible', badgeMore: 'Mira lo nuevo',
    kicker: 'kywai por dentro', title: 'Todas sus pantallas, en un minuto.', note: 'Capturas reales de la app en modo demo, con agentes simulados.', pause: 'Pausar el recorrido', play: 'Seguir el recorrido',
    tabs: [
      ['Chat y coordinador', 'Escribe una tarea. kywai / Hermes la divide, se la da a cada agente según lo que hace mejor y te enseña el plan en marcha.', ['Plan', 'Archivos', 'Voz']],
      ['Espacio 3D', 'Ves a tu equipo trabajar: quién tiene cada tarea, a quién espera y qué acaba de entregar.', ['Avisos en vivo', 'Música', 'Pantalla completa']],
      ['Espacio 2D', 'El mismo equipo dibujado, ligero para cualquier ordenador. Cuatro escenas: Flujo, Mesa, Aldea y Tren.', ['Sin tarjeta gráfica', '4 escenas']],
      ['Tablero', 'Deja tareas en «Por hacer» y el equipo las va moviendo hasta «Hecho». Lo que espera tu sí sale aparte.', ['Por hacer', 'Te espera', 'Hecho']],
      ['Estudio', 'Vídeos, voces, imágenes y clips desde el mismo chat. Tú eliges con qué se genera cada cosa.', ['/video', '/editar', '/recortes', 'Rehacer con…']],
      ['Temas', 'Cambia el aspecto de toda la app y del mundo de tus agentes, de claro a neón.', ['Perla', 'Esmeralda', 'Neón', 'Frost Glass']],
      ['kywai Cloud', 'Tu kywai encendido las 24 horas en el navegador, con Mi cuenta para tus agentes, tu consumo y tus créditos.', ['24/7', 'Mi cuenta', 'Créditos']],
      ['Órbita en el móvil', 'Tu equipo en Android: escribe una tarea, mira el mundo y recibe los resultados.', ['Android', 'Avisos']],
    ],
    studio: [['/video', 'un vídeo de 30 s para presentar la tienda'], ['/editar', 'quita los silencios de esta grabación'], ['/recortes', 'saca 5 clips verticales de este enlace']],
    engines: 'Generar con', engineNames: ['Mi ChatGPT', 'Modelos locales', 'Nube'], studioNote: 'Ejemplos de órdenes del estudio.',
    newKicker: 'Lo nuevo en la 1.0', newTitle: 'Lo último que ha llegado a kywai.', allNotes: 'Todas las notas de la versión',
    news: [
      ['Tu suscripción en Hermes', 'El coordinador usa tu cuenta de ChatGPT o de Claude, con todos los modelos de tu plan.'],
      ['Imágenes y vídeo a tu elección', 'Generas con tu ChatGPT, con modelos locales o en la nube, y puedes «Rehacer con…» otro.'],
      ['Modelos locales en un clic', 'kywai recomienda los que van bien en tu equipo, los instala y los deja listos.'],
      ['Slack y Teams', 'Menciona a kywai en un canal de tu empresa y la respuesta llega allí con sus archivos.'],
      ['«Tu día»', 'Al volver ves lo que espera tu sí, las rutinas de hoy y lo que hizo tu equipo.'],
      ['Encargos en lote', '«Haz una web para cada uno de estos 30 negocios» se reparte en una tarea por elemento.'],
    ],
  },
  en: {
    badge: 'Out now', badgeMore: 'See what’s new',
    kicker: 'Inside kywai', title: 'Every screen, in one minute.', note: 'Real app screenshots in demo mode, with simulated agents.', pause: 'Pause the tour', play: 'Resume the tour',
    tabs: [
      ['Chat and coordinator', 'Write a task. kywai / Hermes splits it, gives each agent what it does best and shows you the plan as it runs.', ['Plan', 'Files', 'Voice']],
      ['3D space', 'Watch your team work: who has each task, who they are waiting for and what they just delivered.', ['Live updates', 'Music', 'Full screen']],
      ['2D space', 'The same team, drawn and light enough for any computer. Four scenes: Flow, Desk, Village and Train.', ['No graphics card', '4 scenes']],
      ['Board', 'Drop tasks in “To do” and the team moves them to “Done”. Anything waiting for your OK is set apart.', ['To do', 'Waiting on you', 'Done']],
      ['Studio', 'Videos, voices, images and clips from the same chat. You choose what makes each one.', ['/video', '/editar', '/recortes', 'Redo with…']],
      ['Themes', 'Change the look of the whole app and your agents’ world, from light to neon.', ['Pearl', 'Emerald', 'Neon', 'Frost Glass']],
      ['kywai Cloud', 'Your kywai running 24 hours a day in the browser, with My account for your agents, usage and credits.', ['24/7', 'My account', 'Credits']],
      ['Órbita on your phone', 'Your team on Android: write a task, watch the world and get the results.', ['Android', 'Notifications']],
    ],
    studio: [['/video', 'a 30-second video to present the shop'], ['/editar', 'cut the silences from this recording'], ['/recortes', 'make 5 vertical clips from this link']],
    engines: 'Create with', engineNames: ['My ChatGPT', 'Local models', 'Cloud'], studioNote: 'Example studio commands.',
    newKicker: 'New in 1.0', newTitle: 'The latest additions to kywai.', allNotes: 'All release notes',
    news: [
      ['Your subscription in Hermes', 'The coordinator uses your ChatGPT or Claude account, with every model your plan includes.'],
      ['Images and video, your choice', 'Create with your ChatGPT, with local models or in the cloud, and “Redo with…” another one.'],
      ['Local models in one click', 'kywai suggests the ones that run well on your computer, installs them and sets them up.'],
      ['Slack and Teams', 'Mention kywai in a company channel and the answer arrives there with its files.'],
      ['“Your day”', 'When you come back you see what needs your OK, today’s routines and what your team did.'],
      ['Batch jobs', '“Build a website for each of these 30 businesses” becomes one task per item.'],
    ],
  },
  pt: {
    badge: 'Já disponível', badgeMore: 'Veja as novidades',
    kicker: 'kywai por dentro', title: 'Todas as telas, em um minuto.', note: 'Capturas reais do app em modo demo, com agentes simulados.', pause: 'Pausar o tour', play: 'Continuar o tour',
    tabs: [
      ['Chat e coordenador', 'Escreva uma tarefa. kywai / Hermes a divide, entrega a cada agente o que ele faz melhor e mostra o plano em andamento.', ['Plano', 'Arquivos', 'Voz']],
      ['Espaço 3D', 'Veja sua equipe trabalhar: quem tem cada tarefa, por quem espera e o que acabou de entregar.', ['Avisos ao vivo', 'Música', 'Tela cheia']],
      ['Espaço 2D', 'A mesma equipe desenhada, leve para qualquer computador. Quatro cenas: Fluxo, Mesa, Aldeia e Trem.', ['Sem placa de vídeo', '4 cenas']],
      ['Quadro', 'Deixe tarefas em «A fazer» e a equipe as leva até «Feito». O que espera o seu sim fica à parte.', ['A fazer', 'Espera por você', 'Feito']],
      ['Estúdio', 'Vídeos, vozes, imagens e clipes no mesmo chat. Você escolhe com o que cada coisa é gerada.', ['/video', '/editar', '/recortes', 'Refazer com…']],
      ['Temas', 'Mude o visual de todo o app e do mundo dos seus agentes, do claro ao neon.', ['Pérola', 'Esmeralda', 'Neon', 'Frost Glass']],
      ['kywai Cloud', 'Seu kywai ligado 24 horas no navegador, com Minha conta para agentes, consumo e créditos.', ['24/7', 'Minha conta', 'Créditos']],
      ['Órbita no celular', 'Sua equipe no Android: escreva uma tarefa, veja o mundo e receba os resultados.', ['Android', 'Avisos']],
    ],
    studio: [['/video', 'um vídeo de 30 s para apresentar a loja'], ['/editar', 'tire os silêncios desta gravação'], ['/recortes', 'faça 5 clipes verticais deste link']],
    engines: 'Gerar com', engineNames: ['Meu ChatGPT', 'Modelos locais', 'Nuvem'], studioNote: 'Exemplos de comandos do estúdio.',
    newKicker: 'Novidades da 1.0', newTitle: 'O que acabou de chegar ao kywai.', allNotes: 'Todas as notas da versão',
    news: [
      ['Sua assinatura no Hermes', 'O coordenador usa sua conta do ChatGPT ou do Claude, com todos os modelos do seu plano.'],
      ['Imagens e vídeo à sua escolha', 'Gere com seu ChatGPT, com modelos locais ou na nuvem, e use «Refazer com…» outro.'],
      ['Modelos locais em um clique', 'O kywai recomenda os que rodam bem no seu computador, instala e deixa prontos.'],
      ['Slack e Teams', 'Mencione o kywai num canal da empresa e a resposta chega lá com os arquivos.'],
      ['«Seu dia»', 'Ao voltar você vê o que espera o seu sim, as rotinas de hoje e o que a equipe fez.'],
      ['Tarefas em lote', '«Faça um site para cada um destes 30 negócios» vira uma tarefa por item.'],
    ],
  },
  fr: {
    badge: 'Disponible', badgeMore: 'Voir les nouveautés',
    kicker: 'kywai de l’intérieur', title: 'Tous ses écrans, en une minute.', note: 'Captures réelles de l’app en mode démo, avec des agents simulés.', pause: 'Mettre la visite en pause', play: 'Reprendre la visite',
    tabs: [
      ['Chat et coordinateur', 'Écrivez une tâche. kywai / Hermes la découpe, confie à chaque agent ce qu’il fait le mieux et montre le plan en cours.', ['Plan', 'Fichiers', 'Voix']],
      ['Espace 3D', 'Regardez votre équipe travailler : qui a chaque tâche, qui elle attend et ce qu’elle vient de livrer.', ['En direct', 'Musique', 'Plein écran']],
      ['Espace 2D', 'La même équipe dessinée, légère pour tout ordinateur. Quatre scènes : Flux, Bureau, Village et Train.', ['Sans carte graphique', '4 scènes']],
      ['Tableau', 'Déposez des tâches dans « À faire » et l’équipe les mène jusqu’à « Fait ». Ce qui attend votre accord est à part.', ['À faire', 'Vous attend', 'Fait']],
      ['Studio', 'Vidéos, voix, images et clips depuis le même chat. Vous choisissez avec quoi chaque chose est créée.', ['/video', '/editar', '/recortes', 'Refaire avec…']],
      ['Thèmes', 'Changez l’apparence de toute l’app et du monde de vos agents, du clair au néon.', ['Perle', 'Émeraude', 'Néon', 'Frost Glass']],
      ['kywai Cloud', 'Votre kywai allumé 24 h/24 dans le navigateur, avec Mon compte pour vos agents, votre consommation et vos crédits.', ['24/7', 'Mon compte', 'Crédits']],
      ['Órbita sur mobile', 'Votre équipe sur Android : écrivez une tâche, regardez le monde et recevez les résultats.', ['Android', 'Notifications']],
    ],
    studio: [['/video', 'une vidéo de 30 s pour présenter la boutique'], ['/editar', 'enlève les silences de cet enregistrement'], ['/recortes', 'fais 5 clips verticaux à partir de ce lien']],
    engines: 'Créer avec', engineNames: ['Mon ChatGPT', 'Modèles locaux', 'Cloud'], studioNote: 'Exemples de commandes du studio.',
    newKicker: 'Nouveau dans la 1.0', newTitle: 'Les derniers ajouts à kywai.', allNotes: 'Toutes les notes de version',
    news: [
      ['Votre abonnement dans Hermes', 'Le coordinateur utilise votre compte ChatGPT ou Claude, avec tous les modèles de votre offre.'],
      ['Images et vidéo, au choix', 'Créez avec votre ChatGPT, des modèles locaux ou le cloud, et « Refaire avec… » un autre.'],
      ['Modèles locaux en un clic', 'kywai recommande ceux qui tournent bien sur votre ordinateur, les installe et les prépare.'],
      ['Slack et Teams', 'Mentionnez kywai dans un canal de l’entreprise et la réponse y arrive avec ses fichiers.'],
      ['« Votre journée »', 'À votre retour, vous voyez ce qui attend votre accord, les routines du jour et le travail de l’équipe.'],
      ['Tâches en lot', '« Fais un site pour chacun de ces 30 commerces » devient une tâche par élément.'],
    ],
  },
  zh: {
    badge: '现已推出', badgeMore: '查看新功能',
    kicker: '走进 kywai', title: '一分钟看完所有界面。', note: '演示模式下的真实应用截图，智能体为模拟数据。', pause: '暂停浏览', play: '继续浏览',
    tabs: [
      ['聊天与协调者', '写下一个任务。kywai / Hermes 会拆分任务，按各自所长分配给每个智能体，并实时展示计划。', ['计划', '文件', '语音']],
      ['3D 空间', '看着你的团队工作：谁负责哪个任务、在等谁、刚交付了什么。', ['实时提醒', '音乐', '全屏']],
      ['2D 空间', '同一个团队的手绘版本，任何电脑都能流畅运行。四个场景：流程、桌面、村庄和火车。', ['无需显卡', '4 个场景']],
      ['看板', '把任务放进“待办”，团队会一路推进到“完成”。等你确认的事项单独列出。', ['待办', '等你确认', '完成']],
      ['工作室', '在同一个聊天里制作视频、语音、图片和短片。由你决定用什么生成。', ['/video', '/editar', '/recortes', '换一个重做']],
      ['主题', '更换整个应用和智能体世界的外观，从浅色到霓虹。', ['珍珠', '翡翠', '霓虹', 'Frost Glass']],
      ['kywai Cloud', '你的 kywai 在浏览器中 24 小时运行，“我的账户”里管理智能体、用量和点数。', ['24/7', '我的账户', '点数']],
      ['手机上的 Órbita', '在 Android 上使用你的团队：写任务、看世界、收结果。', ['Android', '通知']],
    ],
    studio: [['/video', '做一个 30 秒的店铺介绍视频'], ['/editar', '去掉这段录音里的空白'], ['/recortes', '从这个链接剪出 5 个竖屏短片']],
    engines: '生成方式', engineNames: ['我的 ChatGPT', '本地模型', '云端'], studioNote: '工作室指令示例。',
    newKicker: '1.0 新功能', newTitle: 'kywai 最新加入的功能。', allNotes: '全部版本说明',
    news: [
      ['在 Hermes 中使用你的订阅', '协调者使用你的 ChatGPT 或 Claude 账户，包含你套餐里的所有模型。'],
      ['图片和视频，由你选择', '用你的 ChatGPT、本地模型或云端生成，还能“换一个重做”。'],
      ['一键安装本地模型', 'kywai 推荐适合你电脑的模型，自动安装并配置好。'],
      ['Slack 和 Teams', '在公司频道里提到 kywai，回复和文件会直接发到那里。'],
      ['“你的一天”', '回来时一眼看到等你确认的事项、今天的例行任务和团队的成果。'],
      ['批量任务', '“给这 30 家店各做一个网站”会拆成每家一个任务。'],
    ],
  },
  hi: {
    badge: 'अब उपलब्ध', badgeMore: 'नया क्या है देखें',
    kicker: 'kywai के अंदर', title: 'हर स्क्रीन, एक मिनट में।', note: 'डेमो मोड में ऐप के असली स्क्रीनशॉट, सिम्युलेटेड एजेंटों के साथ।', pause: 'टूर रोकें', play: 'टूर जारी रखें',
    tabs: [
      ['चैट और कोऑर्डिनेटर', 'एक काम लिखें। kywai / Hermes उसे बाँटता है, हर एजेंट को वही देता है जो वह सबसे अच्छा करता है और चलती योजना दिखाता है।', ['योजना', 'फ़ाइलें', 'आवाज़']],
      ['3D स्पेस', 'अपनी टीम को काम करते देखें: कौन सा काम किसके पास है, वह किसका इंतज़ार कर रहा है और उसने अभी क्या सौंपा।', ['लाइव सूचनाएँ', 'संगीत', 'पूरी स्क्रीन']],
      ['2D स्पेस', 'वही टीम, चित्रों में, किसी भी कंप्यूटर पर हल्की। चार दृश्य: फ़्लो, मेज़, गाँव और ट्रेन।', ['ग्राफ़िक्स कार्ड की ज़रूरत नहीं', '4 दृश्य']],
      ['बोर्ड', 'काम «करना है» में रखें और टीम उन्हें «हो गया» तक ले जाती है। आपकी मंज़ूरी वाले काम अलग दिखते हैं।', ['करना है', 'आपका इंतज़ार', 'हो गया']],
      ['स्टूडियो', 'उसी चैट से वीडियो, आवाज़, तस्वीरें और क्लिप। हर चीज़ किससे बने, यह आप चुनते हैं।', ['/video', '/editar', '/recortes', 'दूसरे से दोबारा बनाएँ']],
      ['थीम', 'पूरे ऐप और आपके एजेंटों की दुनिया का रूप बदलें, हल्के से नियॉन तक।', ['पर्ल', 'एमराल्ड', 'नियॉन', 'Frost Glass']],
      ['kywai Cloud', 'आपका kywai ब्राउज़र में 24 घंटे चालू, एजेंटों, उपयोग और क्रेडिट के लिए «मेरा खाता» के साथ।', ['24/7', 'मेरा खाता', 'क्रेडिट']],
      ['फ़ोन पर Órbita', 'Android पर आपकी टीम: काम लिखें, दुनिया देखें और नतीजे पाएँ।', ['Android', 'सूचनाएँ']],
    ],
    studio: [['/video', 'दुकान के परिचय के लिए 30 सेकंड का वीडियो'], ['/editar', 'इस रिकॉर्डिंग से खामोशी हटाओ'], ['/recortes', 'इस लिंक से 5 वर्टिकल क्लिप बनाओ']],
    engines: 'इससे बनाएँ', engineNames: ['मेरा ChatGPT', 'लोकल मॉडल', 'क्लाउड'], studioNote: 'स्टूडियो कमांड के उदाहरण।',
    newKicker: '1.0 में नया', newTitle: 'kywai में आई नई चीज़ें।', allNotes: 'सभी रिलीज़ नोट्स',
    news: [
      ['Hermes में आपकी सदस्यता', 'कोऑर्डिनेटर आपके ChatGPT या Claude खाते का उपयोग करता है, आपके प्लान के सभी मॉडलों के साथ।'],
      ['तस्वीरें और वीडियो, आपकी पसंद से', 'अपने ChatGPT, लोकल मॉडल या क्लाउड से बनाएँ, और «दूसरे से दोबारा बनाएँ»।'],
      ['एक क्लिक में लोकल मॉडल', 'kywai आपके कंप्यूटर पर अच्छे चलने वाले मॉडल सुझाता है, इंस्टॉल करता है और तैयार कर देता है।'],
      ['Slack और Teams', 'कंपनी के चैनल में kywai का ज़िक्र करें और जवाब फ़ाइलों के साथ वहीं आता है।'],
      ['«आपका दिन»', 'लौटने पर देखें कि किस पर आपकी मंज़ूरी चाहिए, आज के रूटीन और टीम ने क्या किया।'],
      ['एक साथ कई काम', '«इन 30 दुकानों में से हर एक के लिए वेबसाइट बनाओ» हर आइटम के लिए एक काम बन जाता है।'],
    ],
  },
}

/** El recorrido de 8 pestañas (sustituye a la captura fija) y la franja «Lo nuevo en la 1.0». */
export function renderRecorrido({ r, lang, base, esc, releases }) {
  const carpeta = lang === 'es' ? 'es' : 'en'
  const imagen = id => id === 'orbita' ? `${base}assets/img/movil-chat.jpg` : `${base}assets/img/recorrido/${carpeta}/${id}.webp`
  const estudio = `<div class="tour-studio">${r.studio.map(([cmd, txt]) => `<p><code>${esc(cmd)}</code>${esc(txt)}</p>`).join('')}<p class="tour-engines"><span>${esc(r.engines)}</span>${r.engineNames.map(n => `<b>${esc(n)}</b>`).join('')}</p><small>${esc(r.studioNote)}</small></div>`
  const tabs = PANTALLAS.map((id, i) => `<button type="button" role="tab" id="tour-tab-${id}" aria-controls="tour-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(r.tabs[i][0])}</button>`).join('')
  const panels = PANTALLAS.map((id, i) => {
    const [name, body, chips] = r.tabs[i]
    const shot = id === 'estudio' ? estudio : `<img src="${imagen(id)}" alt="${esc(name)}" width="${id === 'orbita' ? 460 : 1600}" height="${id === 'orbita' ? 727 : id === '3d' ? 832 : 900}" loading="${i === 0 ? 'eager' : 'lazy'}"${i === 0 ? ' fetchpriority="high"' : ''}>`
    return `<div class="tour-panel" id="tour-${id}" role="tabpanel" aria-labelledby="tour-tab-${id}" tabindex="0"${i ? ' hidden' : ''}><div class="tour-shot tour-shot-${id}">${shot}</div><div class="tour-copy"><h3>${esc(name)}</h3><p>${esc(body)}</p><ul class="tour-chips">${chips.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div></div>`
  }).join('')
  const tour = `<figure class="product-tour" id="video" data-tour><div class="product-stage-bar"><span class="stage-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(r.kicker)} · ${esc(r.title)}</span><button type="button" class="tour-toggle" data-tour-toggle data-label-pause="${esc(r.pause)}" data-label-play="${esc(r.play)}" aria-label="${esc(r.pause)}" title="${esc(r.pause)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="tour-ico-pause" d="M8 5v14M16 5v14"/><path class="tour-ico-play" d="m8 5 11 7-11 7Z"/></svg></button></div><div class="tour-tabs" role="tablist" aria-label="${esc(r.kicker)}">${tabs}</div>${panels}<figcaption>${esc(r.note)}</figcaption></figure>`
  const news = `<section class="section news-section" id="novedades"><div class="wrap"><div class="section-head"><p class="eyebrow">${esc(r.newKicker)}</p><h2>${esc(r.newTitle)}</h2></div><div class="news-grid">${r.news.map(([t, b]) => `<article><h3>${esc(t)}</h3><p>${esc(b)}</p></article>`).join('')}</div><a class="text-link" href="${releases}">${esc(r.allNotes)} <span aria-hidden="true">→</span></a></div></section>`
  const badge = `<a class="release-badge" href="#novedades"><strong>kywai 1.0</strong><span>${esc(r.badge)}</span><span class="release-badge-more">${esc(r.badgeMore)} →</span></a>`
  return { tour, news, badge }
}
