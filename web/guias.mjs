// Pasos contrastados con ExtensionsTab.tsx y las configuraciones de FEATURED_MCP.
import { CONEXIONES } from './escaparate.mjs'
export const GUIAS = {
 es: {
  title:'Conecta una herramienta, paso a paso.', intro:'Elige un servicio y sigue la guía dentro de la aplicación kywai.', open:'Guía paso a paso', quickTitle:'¿Es tu primera conexión?', quickBody:'Empieza por DeepWiki: no necesita una clave adicional ni instalar un servidor local.', start:'Abrir la guía de DeepWiki', choose:'¿Qué quieres conectar?', back:'Ver todos los conectores', forDesktop:'Guía para escritorio', prerequisite:'Antes de empezar', prerequisiteBody:'Ten kywai instalado y al menos un agente conectado: Claude, Codex, Gemini o Hermes. Estas conexiones no están disponibles en modo demo.', download:'Descargar kywai', agents:'Ver agentes',
  headings:['Abre el lugar correcto','Añade el servicio','Completa la configuración','Guarda y comprueba','Dáselo a tu agente','Haz una primera prueba'],
  settings:'En kywai, abre Ajustes → Extensiones → Servidores MCP. Pulsa «Explorar catálogo».', install:'Localiza «{name}» entre los destacados y pulsa «Instalar». Si no lo ves, usa el buscador del catálogo.', noKey:'Conserva los valores que aparecen en el formulario. Este servicio no necesita una clave en su configuración destacada.', key:'Abre tu cuenta del proveedor y consigue tu propia clave o token. En kywai, busca la fila «{field}». Deja ese nombre como está y pega tu clave en la casilla «Valor» de la derecha, con este formato:', credentials:'Abrir la página del proveedor', replace:'Sustituye TU_TOKEN o TU_CLAVE por tu valor real, únicamente dentro de kywai. Esta web no te pide que introduzcas claves.', save:'Pulsa «Guardar y probar». Espera a que termine: la primera vez puede descargar lo necesario. Un mensaje «Responde…» confirma que el servidor contestó. Si aparece un error, resuélvelo antes de continuar.', assign:'En la tarjeta del servicio, pulsa el nombre del agente que quieres que lo use. Debe quedar encendido. Un servidor que responde todavía necesita asignarse a un agente.', test:'Vuelve al chat de ese agente y prueba este encargo:', success:'Cómo saber que quedó listo', checks:['El servidor muestra «Responde…» sin un error.','El nombre del agente está encendido en su tarjeta.','El agente puede usar el servicio en una tarea.'],
  runtime:{remote:'Esta conexión usa un servidor remoto; no requiere instalar Node.js o uv para el conector.',node:'Si la prueba indica que falta Node.js, pulsa «Instalar Node.js» en la tarjeta y espera a que vuelva a probar.',uv:'Si la prueba indica que falta uv, pulsa «Instalar uv» en la tarjeta y espera a que vuelva a probar.',lightpanda:'Lightpanda debe estar instalado en el equipo de los agentes. Sigue su documentación oficial. Está disponible en macOS y Linux; en Windows necesita WSL.'},
  troubleshoot:'¿Te has quedado en un paso?', problems:['No veo Extensiones: abre los ajustes de la aplicación instalada, no la web de presentación.','Veo «No disponible en modo demo»: abre una instalación real de kywai.','El agente aparece en gris: elige Claude, Codex, Gemini o Hermes y comprueba que esté conectado.','Veo un error de autorización: comprueba tu clave, su formato y sus permisos en el proveedor.'], manual:'Consultar la documentación del servicio', support:'Pedir ayuda', copy:'Copiar', copied:'Copiado', fallback:'Si no encuentras el servicio en el catálogo', fallbackBody:'Pulsa «Añadir a mano», pega esta dirección u orden y pulsa «Continuar». Después sigue la configuración de esta guía.', sample:'Usa {name} para indicar qué herramientas tienes disponibles. No modifiques archivos ni publiques nada.', cloud:'Las conexiones de Composio para Cloud siguen en preparación. Esta guía explica la configuración de escritorio.',
 },
 en: {
  title:'Connect a tool, step by step.', intro:'Choose a service and follow the guide inside the kywai application.', open:'Step-by-step guide', quickTitle:'Your first connection?', quickBody:'Start with DeepWiki: no extra key or local connector server installation needed.', start:'Open the DeepWiki guide', choose:'What do you want to connect?', back:'See all connectors', forDesktop:'Desktop guide', prerequisite:'Before you start', prerequisiteBody:'Have kywai installed and at least one agent connected: Claude, Codex, Gemini or Hermes. These connections are unavailable in demo mode.', download:'Download kywai', agents:'See agents',
  headings:['Open the right place','Add the service','Complete the configuration','Save and check','Give it to your agent','Try it in the chat'],
  settings:'In kywai, open Settings → Extensions → MCP servers. Click “Browse catalog”.', install:'Find “{name}” in the featured list and click “Install”. If you do not see it, use the catalog search.', noKey:'Keep the values shown in the form. This service needs no key in its featured configuration.', key:'Open your provider account and get your own key or token. In kywai, find the “{field}” row. Keep that name unchanged and paste your key into the “Value” box on its right using this format:', credentials:'Open the provider page', replace:'Replace TU_TOKEN or TU_CLAVE with your real value only inside kywai. This website does not ask you to enter keys.', save:'Click “Save and test”. Wait for it to finish: the first attempt may download what it needs. A “Responds…” message confirms that the server answered. Resolve any error before continuing.', assign:'On the service card, click the name of the agent that should use it. It must be turned on. A responding server still needs to be assigned to an agent.', test:'Return to that agent’s chat and try this request:', success:'How to know it is ready', checks:['The server shows “Responds…” without an error.','The agent’s name is turned on in the service card.','The agent can use the service in a task.'],
  runtime:{remote:'This connection uses a remote server; the connector does not require Node.js or uv.',node:'If the test reports missing Node.js, click “Install Node.js” on the card and wait for the next test.',uv:'If the test reports missing uv, click “Install uv” on the card and wait for the next test.',lightpanda:'Lightpanda must be installed on the agents’ machine. Follow its official documentation. It supports macOS and Linux; Windows requires WSL.'},
  troubleshoot:'Stuck on a step?', problems:['Cannot find Extensions: open the installed application settings, not the marketing website.','“Not available in demo mode”: open a real kywai installation.','The agent is greyed out: choose Claude, Codex, Gemini or Hermes and check it is connected.','Authorization error: check your key, its format and its provider permissions.'], manual:'Read the service documentation', support:'Get help', copy:'Copy', copied:'Copied', fallback:'If you cannot find the service in the catalog', fallbackBody:'Click “Add manually”, paste this address or command and click “Continue”. Then follow this guide’s configuration steps.', sample:'Use {name} to list the tools you have available. Do not modify files or publish anything.', cloud:'Composio connections for Cloud are still in preparation. This guide covers desktop configuration.',
 },
 pt: {
  title:'Conecte uma ferramenta, passo a passo.', intro:'Escolha um serviço e siga a guia dentro do aplicativo kywai.', open:'Guia passo a passo', quickTitle:'Sua primeira conexão?', quickBody:'Comece pelo DeepWiki: não precisa de uma chave adicional nem instalar um servidor local.', start:'Abrir a guia do DeepWiki', choose:'O que deseja conectar?', back:'Ver todos os conectores', forDesktop:'Guia para desktop', prerequisite:'Antes de começar', prerequisiteBody:'Tenha o kywai instalado e um agente conectado: Claude, Codex, Gemini ou Hermes. Estas conexões não estão disponíveis no modo demo.', download:'Baixar kywai', agents:'Ver agentes',
  headings:['Abra o lugar certo','Adicione o serviço','Complete a configuração','Salve e confira','Ative para seu agente','Teste no chat'],
  settings:'No kywai, abra Configurações → Extensões → Servidores MCP. Clique em “Explorar catálogo”.', install:'Localize “{name}” nos destaques e clique em “Instalar”. Se não aparecer, use a busca do catálogo.', noKey:'Mantenha os valores do formulário. O serviço não precisa de chave na configuração em destaque.', key:'Abra sua conta do provedor e obtenha sua chave ou token. No kywai, encontre a linha “{field}”. Mantenha esse nome e cole sua chave na caixa “Valor” à direita, neste formato:', credentials:'Abrir a página do provedor', replace:'Substitua TU_TOKEN ou TU_CLAVE pelo seu valor real apenas dentro do kywai. Este site não pede chaves.', save:'Clique em “Salvar e testar”. Aguarde: na primeira vez, pode baixar o necessário. A mensagem “Responde…” confirma que o servidor respondeu. Resolva qualquer erro antes de continuar.', assign:'Na ficha do serviço, clique no nome do agente que deve usá-lo. Ele precisa ficar ativado. Um servidor que responde ainda precisa ser atribuído a um agente.', test:'Volte ao chat desse agente e teste este pedido:', success:'Como saber que ficou pronto', checks:['O servidor mostra “Responde…” sem erro.','O nome do agente está ativado na ficha do serviço.','O agente consegue usar o serviço em uma tarefa.'],
  runtime:{remote:'Esta conexão usa um servidor remoto; o conector não exige Node.js nem uv.',node:'Se o teste indicar que falta Node.js, clique em “Instalar Node.js” na ficha e aguarde o novo teste.',uv:'Se o teste indicar que falta uv, clique em “Instalar uv” na ficha e aguarde o novo teste.',lightpanda:'O Lightpanda precisa estar instalado no equipamento dos agentes. Siga a documentação oficial. Funciona no macOS e Linux; no Windows precisa de WSL.'},
  troubleshoot:'Parou em algum passo?', problems:['Não encontro Extensões: abra os ajustes do aplicativo instalado, não o site de apresentação.','“Não disponível no modo demo”: abra uma instalação real do kywai.','Agente em cinza: escolha Claude, Codex, Gemini ou Hermes e confira sua conexão.','Erro de autorização: confira a chave, o formato e as permissões no provedor.'], manual:'Ler a documentação do serviço', support:'Pedir ajuda', copy:'Copiar', copied:'Copiado', fallback:'Se não encontrar o serviço no catálogo', fallbackBody:'Clique em “Adicionar manualmente”, cole este endereço ou comando e clique em “Continuar”. Depois siga a configuração desta guia.', sample:'Use {name} para indicar quais ferramentas estão disponíveis. Não altere arquivos nem publique nada.', cloud:'As conexões Composio para Cloud ainda estão em preparação. Esta guia explica a configuração no desktop.',
 },
 fr: {
  title:'Connectez un outil, étape par étape.', intro:'Choisissez un service et suivez le guide dans l’application kywai.', open:'Guide pas à pas', quickTitle:'Votre première connexion ?', quickBody:'Commencez par DeepWiki : aucune clé supplémentaire ni serveur local à installer.', start:'Ouvrir le guide DeepWiki', choose:'Que voulez-vous connecter ?', back:'Voir tous les connecteurs', forDesktop:'Guide pour le bureau', prerequisite:'Avant de commencer', prerequisiteBody:'Installez kywai et connectez au moins un agent : Claude, Codex, Gemini ou Hermes. Ces connexions ne sont pas disponibles en mode démo.', download:'Télécharger kywai', agents:'Voir les agents',
  headings:['Ouvrez le bon endroit','Ajoutez le service','Complétez la configuration','Enregistrez et vérifiez','Activez pour votre agent','Essayez dans le chat'],
  settings:'Dans kywai, ouvrez Réglages → Extensions → Serveurs MCP. Cliquez sur « Parcourir le catalogue ».', install:'Repérez « {name} » dans les services proposés et cliquez sur « Installer ». Sinon, utilisez la recherche du catalogue.', noKey:'Conservez les valeurs du formulaire. Aucune clé n’est requise dans la configuration proposée.', key:'Ouvrez votre compte fournisseur et obtenez votre propre clé ou token. Dans kywai, repérez la ligne « {field} ». Gardez ce nom et collez la clé dans la case « Valeur » à droite, au format suivant :', credentials:'Ouvrir la page du fournisseur', replace:'Remplacez TU_TOKEN ou TU_CLAVE par votre valeur réelle uniquement dans kywai. Ce site ne demande pas de clés.', save:'Cliquez sur « Enregistrer et tester ». Patientez : le premier essai peut télécharger les éléments nécessaires. Un message « Répond… » confirme la réponse du serveur. Résolvez toute erreur avant de continuer.', assign:'Sur la fiche du service, cliquez sur le nom de l’agent qui doit l’utiliser. Il doit être activé. Un serveur qui répond doit encore être attribué à un agent.', test:'Revenez dans le chat de cet agent et essayez cette demande :', success:'Comment savoir que tout est prêt', checks:['Le serveur affiche « Répond… » sans erreur.','Le nom de l’agent est activé sur la fiche.','L’agent peut utiliser le service dans une tâche.'],
  runtime:{remote:'Ce connecteur utilise un serveur distant, sans installation de Node.js ou uv.',node:'Si le test signale l’absence de Node.js, cliquez sur « Installer Node.js » puis attendez le nouveau test.',uv:'Si le test signale l’absence de uv, cliquez sur « Installer uv » puis attendez le nouveau test.',lightpanda:'Lightpanda doit être installé sur la machine des agents. Suivez la documentation officielle. Disponible sur macOS et Linux ; Windows nécessite WSL.'},
  troubleshoot:'Bloqué à une étape ?', problems:['Extensions introuvable : ouvrez les réglages de l’application installée, pas le site de présentation.','« Indisponible en mode démo » : ouvrez une installation réelle de kywai.','Agent grisé : choisissez Claude, Codex, Gemini ou Hermes et vérifiez sa connexion.','Erreur d’autorisation : vérifiez la clé, son format et ses permissions chez le fournisseur.'], manual:'Lire la documentation du service', support:'Demander de l’aide', copy:'Copier', copied:'Copié', fallback:'Si le service est introuvable dans le catalogue', fallbackBody:'Cliquez sur « Ajouter à la main », collez cette adresse ou commande puis cliquez sur « Continuer ». Suivez ensuite la configuration du guide.', sample:'Utilise {name} pour indiquer les outils disponibles. Ne modifie aucun fichier et ne publie rien.', cloud:'Les connexions Composio pour Cloud sont en préparation. Ce guide concerne la configuration de bureau.',
 },
 zh: {
  title:'一步步连接工具。', intro:'选择服务，然后在 kywai 应用中按照指南操作。', open:'分步指南', quickTitle:'第一次连接？', quickBody:'从 DeepWiki 开始：无需额外密钥，也无需安装本地连接服务器。', start:'打开 DeepWiki 指南', choose:'你想连接哪个服务？', back:'查看所有连接器', forDesktop:'桌面版指南', prerequisite:'开始之前', prerequisiteBody:'先安装 kywai，并连接至少一个智能体：Claude、Codex、Gemini 或 Hermes。演示模式不支持这些连接。', download:'下载 kywai', agents:'查看智能体',
  headings:['打开正确位置','添加服务','完成配置','保存并测试','提供给智能体','在聊天中试用'],
  settings:'在 kywai 中打开设置 → 扩展 → MCP 服务器，然后点击“浏览目录”。', install:'在推荐列表中找到“{name}”并点击“安装”。如果找不到，可使用目录搜索。', noKey:'保留表单中的默认值。该服务的推荐配置无需密钥。', key:'登录服务商账户，获取自己的密钥或 token。在 kywai 中找到“{field}”这一行。保留该名称，将密钥按以下格式粘贴到右侧的“值”输入框：', credentials:'打开服务商页面', replace:'只在 kywai 中将 TU_TOKEN 或 TU_CLAVE 替换为真实值。此网站不会要求输入密钥。', save:'点击“保存并测试”并等待完成，首次测试可能会下载所需组件。“可以响应…”信息说明服务器已回应。若出现错误，请先解决再继续。', assign:'在服务卡片上点击需要使用它的智能体名称，确认已开启。服务器能够响应后，仍需分配给智能体。', test:'回到该智能体的聊天中，试试这个请求：', success:'如何确认已就绪', checks:['服务器显示“可以响应…”且没有错误。','服务卡片上的智能体名称已开启。','智能体能在任务中使用该服务。'],
  runtime:{remote:'该连接使用远程服务器，无需为连接器安装 Node.js 或 uv。',node:'若测试提示缺少 Node.js，请点击卡片上的“安装 Node.js”并等待重新测试。',uv:'若测试提示缺少 uv，请点击卡片上的“安装 uv”并等待重新测试。',lightpanda:'需要在智能体所在设备上安装 Lightpanda。请参考官方文档。支持 macOS 和 Linux；Windows 需要 WSL。'},
  troubleshoot:'卡在某个步骤？', problems:['找不到扩展：请打开已安装应用的设置，而不是产品介绍网站。','提示演示模式不可用：请打开真实的 kywai 安装。','智能体显示灰色：请选择 Claude、Codex、Gemini 或 Hermes，并确认已经连接。','授权错误：请检查服务商密钥、格式及其权限。'], manual:'阅读服务文档', support:'寻求帮助', copy:'复制', copied:'已复制', fallback:'如果在目录中找不到服务', fallbackBody:'点击“手动添加”，粘贴下方地址或命令，再点击“继续”，然后按照指南完成配置。', sample:'使用 {name} 列出可用工具。不要修改文件或发布任何内容。', cloud:'Cloud 的 Composio 连接仍在准备中。本指南说明桌面版配置。',
 },
 hi: {
   "title": "एक टूल जोड़ें, कदम-दर-कदम।",
   "intro": "कोई सेवा चुनें और kywai ऐप के अंदर गाइड का पालन करें।",
   "open": "कदम-दर-कदम गाइड",
   "quickTitle": "आपका पहला कनेक्शन?",
   "quickBody": "DeepWiki से शुरू करें: न कोई अतिरिक्त कुंजी चाहिए, न लोकल कनेक्टर सर्वर इंस्टॉल करना।",
   "start": "DeepWiki गाइड खोलें",
   "choose": "आप क्या जोड़ना चाहते हैं?",
   "back": "सभी कनेक्टर देखें",
   "forDesktop": "डेस्कटॉप गाइड",
   "prerequisite": "शुरू करने से पहले",
   "prerequisiteBody": "kywai इंस्टॉल हो और कम से कम एक एजेंट जुड़ा हो: Claude, Codex, Gemini या Hermes। डेमो मोड में ये कनेक्शन उपलब्ध नहीं हैं।",
   "download": "kywai डाउनलोड करें",
   "agents": "एजेंट देखें",
   "headings": [
    "सही जगह खोलें",
    "सेवा जोड़ें",
    "कॉन्फ़िगरेशन पूरा करें",
    "सहेजें और जाँचें",
    "इसे अपने एजेंट को दें",
    "चैट में आज़माएँ"
   ],
   "settings": "kywai में Settings → Extensions → MCP servers खोलें। “Browse catalog” पर क्लिक करें।",
   "install": "चुनी हुई सूची में “{name}” ढूँढें और “Install” पर क्लिक करें। अगर न दिखे, तो कैटलॉग सर्च इस्तेमाल करें।",
   "noKey": "फ़ॉर्म में दिखाए गए मान वैसे ही रहने दें। इस सेवा को अपने चुने हुए कॉन्फ़िगरेशन में किसी कुंजी की ज़रूरत नहीं है।",
   "key": "अपने प्रदाता का खाता खोलें और अपनी कुंजी या टोकन लें। kywai में “{field}” वाली पंक्ति ढूँढें। उस नाम को न बदलें और अपनी कुंजी उसके दाईं ओर “Value” बॉक्स में इस प्रारूप में चिपकाएँ:",
   "credentials": "प्रदाता का पेज खोलें",
   "replace": "TU_TOKEN या TU_CLAVE को अपने असली मान से केवल kywai के अंदर बदलें। यह वेबसाइट आपसे कुंजियाँ दर्ज करने को नहीं कहती।",
   "save": "“Save and test” पर क्लिक करें। इसके पूरा होने का इंतज़ार करें: पहली बार यह ज़रूरी चीज़ें डाउनलोड कर सकता है। “Responds…” संदेश बताता है कि सर्वर ने जवाब दिया। आगे बढ़ने से पहले कोई भी त्रुटि ठीक करें।",
   "assign": "सेवा के कार्ड पर उस एजेंट के नाम पर क्लिक करें जिसे इसे इस्तेमाल करना है। वह चालू होना चाहिए। जवाब देने वाले सर्वर को भी किसी एजेंट को सौंपना ज़रूरी है।",
   "test": "उस एजेंट की चैट पर लौटें और यह अनुरोध आज़माएँ:",
   "success": "कैसे पता चले कि यह तैयार है",
   "checks": [
    "सर्वर बिना त्रुटि के “Responds…” दिखाता है।",
    "सेवा के कार्ड में एजेंट का नाम चालू है।",
    "एजेंट किसी काम में सेवा इस्तेमाल कर पाता है।"
   ],
   "runtime": {
    "remote": "यह कनेक्शन रिमोट सर्वर इस्तेमाल करता है; कनेक्टर को Node.js या uv की ज़रूरत नहीं।",
    "node": "अगर जाँच में Node.js न होने की बात आए, तो कार्ड पर “Install Node.js” पर क्लिक करें और अगली जाँच का इंतज़ार करें।",
    "uv": "अगर जाँच में uv न होने की बात आए, तो कार्ड पर “Install uv” पर क्लिक करें और अगली जाँच का इंतज़ार करें।",
    "lightpanda": "Lightpanda एजेंटों की मशीन पर इंस्टॉल होना चाहिए। इसके आधिकारिक दस्तावेज़ देखें। यह macOS और Linux पर चलता है; Windows पर WSL चाहिए।"
   },
   "troubleshoot": "किसी कदम पर अटक गए?",
   "problems": [
    "Extensions नहीं मिल रहा: इंस्टॉल किए गए ऐप की सेटिंग्स खोलें, मार्केटिंग वेबसाइट नहीं।",
    "“Not available in demo mode”: kywai का असली इंस्टॉलेशन खोलें।",
    "एजेंट धूसर दिख रहा है: Claude, Codex, Gemini या Hermes चुनें और जाँचें कि वह जुड़ा है।",
    "अधिकृति त्रुटि: अपनी कुंजी, उसका प्रारूप और प्रदाता की अनुमतियाँ जाँचें।"
   ],
   "manual": "सेवा के दस्तावेज़ पढ़ें",
   "support": "मदद लें",
   "copy": "कॉपी करें",
   "copied": "कॉपी हो गया",
   "fallback": "अगर आपको कैटलॉग में सेवा न मिले",
   "fallbackBody": "“Add manually” पर क्लिक करें, यह पता या कमांड चिपकाएँ और “Continue” पर क्लिक करें। फिर इस गाइड के कॉन्फ़िगरेशन वाले कदम अपनाएँ।",
   "sample": "{name} से अपने उपलब्ध टूल की सूची बनवाएँ। कोई फ़ाइल न बदलें और कुछ भी प्रकाशित न करें।",
   "cloud": "Cloud के लिए Composio कनेक्शन अभी तैयारी में हैं। यह गाइड डेस्कटॉप कॉन्फ़िगरेशन के बारे में है।"
 },
}
export const CONFIG_GUIAS = [
 ['github','remote','https://api.githubcopilot.com/mcp/','Authorization','Bearer TU_TOKEN','https://github.com/settings/tokens'],
 ['playwright','node','npx -y @playwright/mcp@latest --headless --isolated'],
 ['context7','node','npx -y @upstash/context7-mcp'],
 ['deepwiki','remote','https://mcp.deepwiki.com/mcp'],
 ['fetch','uv','uvx mcp-server-fetch'],
 ['firecrawl','node','npx -y firecrawl-mcp','FIRECRAWL_API_KEY','TU_CLAVE','https://firecrawl.dev/app/api-keys'],
 ['lightpanda','lightpanda','lightpanda mcp'],
 ['perplexity','node','npx -y @perplexity-ai/mcp-server','PERPLEXITY_API_KEY','TU_CLAVE','https://perplexity.ai/account/api'],
 ['pixellab','remote','https://api.pixellab.ai/mcp','Authorization','Bearer TU_TOKEN','https://pixellab.ai/account'],
 ['posthog','remote','https://mcp.posthog.com/mcp','Authorization','Bearer TU_TOKEN','https://posthog.com/docs/model-context-protocol'],
 ['sequential-thinking','node','npx -y @modelcontextprotocol/server-sequential-thinking'],
]
export function renderGuias({s,url,esc}) {
 const copy=code=>`<div class="cmd-row guide-copy"><code>${esc(code)}</code><button type="button" data-copy="${esc(s.copied)}">${esc(s.copy)}</button></div>`
 const step=(title,body)=>`<li><h3>${esc(title)}</h3>${body}</li>`
 const guides=CONEXIONES.map(([name,,,,needsKey],i)=>{
  const [id,runtime,command,field,format,credentials]=CONFIG_GUIAS[i]
  const configuration=needsKey?`<p>${esc(s.key.replace('{field}',field))}</p>${copy(format)}<p>${esc(s.replace)}</p><a class="text-link" href="${credentials}" target="_blank" rel="noopener noreferrer">${esc(s.credentials)} →</a>`:`<p>${esc(s.noKey)}</p>`
  return `<article class="service-guide" id="${id}" data-service-guide="${id}"><header><span class="status-label">${esc(s.forDesktop)}</span><h2>${esc(name)}</h2></header><ol class="connection-steps">${step(s.headings[0],`<p>${esc(s.settings)}</p>`)}${step(s.headings[1],`<p>${esc(s.install.replace('{name}',name))}</p>`)}${step(s.headings[2],configuration+`<p class="guide-runtime">${esc(s.runtime[runtime])}</p>`)}${step(s.headings[3],`<p>${esc(s.save)}</p>`)}${step(s.headings[4],`<p>${esc(s.assign)}</p>`)}${step(s.headings[5],`<p>${esc(s.test)}</p>${copy(s.sample.replace('{name}',name))}`)}</ol><div class="guide-success"><h3>${esc(s.success)}</h3><ul>${s.checks.map(v=>`<li>${esc(v)}</li>`).join('')}</ul></div><details class="guide-fallback"><summary>${esc(s.fallback)}</summary><p>${esc(s.fallbackBody)}</p>${copy(command)}</details><a class="text-link guide-doc-link" href="${CONEXIONES[i][3]}" target="_blank" rel="noopener noreferrer">${esc(s.manual)} →</a></article>`
 })
 const orderedGuides=[guides[3],...guides.filter((_,i)=>i!==3)].join('')
 return `<section class="page-intro"><div class="wrap"><p class="eyebrow">kywai</p><h1>${esc(s.title)}</h1><p class="lede">${esc(s.intro)}</p><a class="text-link guide-back" href="${url('conectores')}">← ${esc(s.back)}</a></div></section><section class="guides-page"><div class="wrap"><div class="guide-before"><h2>${esc(s.prerequisite)}</h2><p>${esc(s.prerequisiteBody)}</p><div><a href="${url('descargas')}">${esc(s.download)} →</a><a href="${url('agentes')}">${esc(s.agents)} →</a></div></div><div class="guide-selector"><label for="guide-service">${esc(s.choose)}</label><select id="guide-service" data-guide-service>${CONEXIONES.map(([name],i)=>`<option value="${CONFIG_GUIAS[i][0]}"${CONFIG_GUIAS[i][0]==='deepwiki'?' selected':''}>${esc(name)}</option>`).join('')}</select></div><div class="service-guides">${orderedGuides}</div><aside class="guide-help"><h2>${esc(s.troubleshoot)}</h2><ul>${s.problems.map(v=>`<li>${esc(v)}</li>`).join('')}</ul><a class="text-link" href="mailto:Yilsander@kywai.app">${esc(s.support)} →</a><p>${esc(s.cloud)}</p></aside></div></section>`
}
