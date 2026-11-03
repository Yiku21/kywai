// Agentes de terminal que se pueden conectar con tu suscripción (los de «cli»: AI Cowork los lanza con la sesión que
// ya tienes iniciada en ellos). Cada entrada dice cómo se ejecuta de forma no interactiva y cómo se instala; todo sale
// de su documentación oficial. `verified: false` = alguna pieza no está confirmada y puede necesitar ajustes.
import type { CatalogEntry } from './agentCatalog'

/** Instala un script de PowerShell (Windows) descargándolo y ejecutándolo: sin comillas dobles dentro. */
const ps = (script: string): string => `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`

/** MiniMax Code por npm: necesita permitir sus scripts de instalación (y los de SQLite) en npm 12. */
const MCODE_NPM = 'npm install -g @minimax-ai/code --allow-scripts=@minimax-ai/code,better-sqlite3 --registry=https://registry.npmjs.org/'

const GENERIC_STRENGTHS = ['programar y editar archivos del proyecto desde la terminal con su propio modelo']
const GENERIC_AVOID = ['imágenes, vídeo y audio: no se ha comprobado que pueda hacerlo']

export const GENERIC_CATALOG: CatalogEntry[] = [
  {
    id: 'aider',
    name: 'Aider',
    summary: 'Programa en pareja con IA: edita los archivos de tu repositorio con el modelo que elijas.',
    account: 'Solo con claves de API (OpenAI, Anthropic, Google, OpenRouter…): no usa tu suscripción de ChatGPT ni de Claude.',
    kind: 'cli',
    verified: true,
    color: '#38d98a',
    role: 'Agente conectado: edita el repositorio del proyecto con el modelo que le hayas configurado',
    strengths: ['cambios concretos en archivos de un repositorio, con el mapa del repositorio como contexto'],
    avoid: [...GENERIC_AVOID, 'no tiene permisos ni sandbox: siempre edita archivos salvo en su modo de solo preguntas'],
    note: 'Deja sus archivos .aider* en la carpeta del proyecto. No hace commits solo (AI Cowork se lo desactiva).',
    cli: {
      command: 'aider',
      versionArgs: ['--version'],
      promptVia: 'file',
      args: [
        '--message-file',
        '{promptFile}',
        '--yes-always',
        '--no-pretty',
        '--no-fancy-input',
        '--no-stream',
        '--no-auto-commits',
        '--no-dirty-commits',
        '--no-suggest-shell-commands',
        '--no-detect-urls',
        '--no-check-update',
        '--no-show-release-notes',
        '--no-analytics'
      ],
      planArgs: ['--chat-mode', 'ask'],
      modelArgs: ['--model', '{model}'],
      env: { NO_COLOR: '1', AIDER_PRETTY: 'false' },
      url: 'https://aider.chat/docs/scripting.html',
      install: {
        windows: ps('irm https://aider.chat/install.ps1 | iex'),
        mac: 'curl -LsSf https://aider.chat/install.sh | sh',
        linux: 'curl -LsSf https://aider.chat/install.sh | sh'
      }
    }
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    summary: 'Los modelos de DeepSeek como agente de código, a través de Aider (DeepSeek no tiene programa de terminal propio).',
    account: 'Con una clave de API de DeepSeek (pago por uso, muy barato): DeepSeek no tiene suscripción mensual.',
    kind: 'cli',
    verified: true,
    color: '#4d6bfe',
    role: 'Agente conectado: edita el repositorio con los modelos de DeepSeek, a través de Aider',
    strengths: ['cambios concretos en archivos de un repositorio, con un modelo muy barato'],
    avoid: [...GENERIC_AVOID, 'tareas largas con muchas herramientas: Aider solo edita archivos, no navega ni instala'],
    note: 'Usa Aider (se instala con él): si ya tienes el agente Aider, este es el mismo programa con el modelo de DeepSeek fijado.',
    cli: {
      command: 'aider',
      versionArgs: ['--version'],
      promptVia: 'file',
      args: [
        '--message-file',
        '{promptFile}',
        '--model',
        'deepseek/deepseek-chat',
        '--yes-always',
        '--no-pretty',
        '--no-fancy-input',
        '--no-stream',
        '--no-auto-commits',
        '--no-dirty-commits',
        '--no-suggest-shell-commands',
        '--no-detect-urls',
        '--no-check-update',
        '--no-show-release-notes',
        '--no-analytics'
      ],
      planArgs: ['--chat-mode', 'ask'],
      env: { NO_COLOR: '1', AIDER_PRETTY: 'false' },
      apiKey: { env: 'DEEPSEEK_API_KEY', label: 'la clave de API de DeepSeek', url: 'https://platform.deepseek.com/api_keys' },
      authPattern: 'AuthenticationError|api key|DEEPSEEK_API_KEY',
      url: 'https://aider.chat/docs/llms/deepseek.html',
      install: {
        windows: ps('irm https://aider.chat/install.ps1 | iex'),
        mac: 'curl -LsSf https://aider.chat/install.sh | sh',
        linux: 'curl -LsSf https://aider.chat/install.sh | sh'
      }
    }
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    summary: 'Agente de programación de código abierto para la terminal, con muchos proveedores.',
    account: 'Con tu suscripción de ChatGPT Plus/Pro, GitHub Copilot, GitLab Duo o SuperGrok (opencode auth login), o claves de API.',
    kind: 'cli',
    verified: false,
    color: '#6ea8fe',
    role: 'Agente conectado: programa en la terminal con tu suscripción de ChatGPT, Copilot o Grok',
    strengths: GENERIC_STRENGTHS,
    avoid: GENERIC_AVOID,
    note: 'Hay dos líneas del programa (OpenCode 1 y 2) que no pueden convivir: los argumentos son los de la 1. Con Claude Pro/Max no cuentes: Anthropic lo prohíbe.',
    cli: {
      command: 'opencode',
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['run', '{prompt}'],
      planArgs: ['--agent', 'plan'],
      fullAccessArgs: ['--auto'],
      modelArgs: ['--model', '{model}'],
      env: { OPENCODE_DISABLE_AUTOUPDATE: 'true' },
      login: 'opencode auth login',
      url: 'https://opencode.ai/docs/cli/',
      install: {
        windows: 'npm install -g opencode-ai',
        mac: 'curl -fsSL https://opencode.ai/install | bash',
        linux: 'curl -fsSL https://opencode.ai/install | bash',
        needs: 'node'
      }
    }
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot CLI',
    summary: 'El agente de programación de GitHub Copilot en la terminal.',
    account: 'Con tu suscripción de GitHub Copilot (copilot login).',
    kind: 'cli',
    verified: true,
    color: '#a371f7',
    role: 'Agente conectado: programa en la terminal con tu suscripción de GitHub Copilot',
    strengths: GENERIC_STRENGTHS,
    avoid: GENERIC_AVOID,
    note: 'En organizaciones con Copilot Business o Enterprise, la política de la organización tiene que permitirlo.',
    cli: {
      command: 'copilot',
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['-p', '{prompt}', '-s', '--no-ask-user', '--no-color'],
      planArgs: ['--plan'],
      // Sin una opción de aprobación el agente no puede escribir ni ejecutar nada en modo sin pantalla.
      workArgs: ['--allow-tool=write'],
      fullAccessArgs: ['--allow-all'],
      modelArgs: ['--model', '{model}'],
      authPattern: 'No authentication information found|Authentication failed|Access denied by policy settings|Classic Personal Access Tokens \\(ghp_\\) are not supported',
      login: 'copilot login',
      url: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically',
      install: {
        windows: 'winget install -e --id GitHub.Copilot --accept-package-agreements --accept-source-agreements --disable-interactivity',
        mac: 'brew install copilot-cli',
        linux: 'curl -fsSL https://gh.io/copilot-install | bash'
      }
    }
  },
  {
    id: 'cursor',
    name: 'Cursor',
    summary: 'El agente de Cursor en la terminal.',
    account: 'Con tu cuenta de Cursor (agent login, en el navegador) o una clave CURSOR_API_KEY.',
    kind: 'cli',
    verified: true,
    color: '#e6e6e6',
    role: 'Agente conectado: programa en la terminal con tu plan de Cursor',
    strengths: GENERIC_STRENGTHS,
    avoid: GENERIC_AVOID,
    note: 'Su comando se llama «agent», un nombre genérico que puede chocar con otro programa del PATH.',
    cli: {
      command: 'agent',
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['-p', '--output-format', 'text', '--trust', '{prompt}'],
      planArgs: ['--mode', 'ask'],
      // Sin --force los cambios solo se proponen. En el proyecto, con su sandbox; con acceso completo, sin él.
      workArgs: ['--force', '--sandbox', 'enabled'],
      fullAccessArgs: ['--force'],
      modelArgs: ['--model', '{model}'],
      authPattern: 'Not authenticated',
      login: 'agent login',
      url: 'https://cursor.com/docs/cli/headless',
      install: {
        windows: ps("irm 'https://cursor.com/install?win32=true' | iex"),
        mac: 'curl https://cursor.com/install -fsS | bash',
        linux: 'curl https://cursor.com/install -fsS | bash'
      }
    }
  },
  {
    id: 'amp',
    name: 'Amp',
    summary: 'Agente de programación de Amp (ampcode.com) en la terminal.',
    account: 'Con una cuenta de Amp con créditos o suscripción; para scripts pide una clave AMP_API_KEY.',
    kind: 'cli',
    verified: false,
    color: '#ff6b3d',
    role: 'Agente conectado: programa en la terminal con tu cuenta de Amp',
    strengths: GENERIC_STRENGTHS,
    avoid: [...GENERIC_AVOID, 'no tiene modo de solo lectura: no pide aprobación para sus herramientas'],
    note: 'Su documentación exige AMP_API_KEY en modo sin pantalla; la sesión de «amp login» es de corta duración.',
    cli: {
      command: 'amp',
      apiKey: { env: 'AMP_API_KEY', label: 'la clave AMP_API_KEY (token sgamp_)', url: 'https://ampcode.com/settings' },
      versionArgs: ['version'],
      promptVia: 'arg',
      args: ['-x', '{prompt}'],
      login: 'amp login',
      url: 'https://ampcode.com/docs/cli/execute-mode',
      install: {
        windows: ps('irm https://ampcode.com/install.ps1 | iex'),
        mac: 'curl -fsSL https://ampcode.com/install.sh | bash',
        linux: 'curl -fsSL https://ampcode.com/install.sh | bash'
      }
    }
  },
  {
    id: 'goose',
    name: 'Goose',
    summary: 'Agente de código y automatización con herramientas, de la Agentic AI Foundation (antes de Block).',
    account: 'Usa tu suscripción de Claude, ChatGPT, Copilot o Cursor a través de sus programas, o una clave de API o un modelo local.',
    kind: 'cli',
    verified: true,
    color: '#f2994a',
    role: 'Agente conectado: automatiza y programa con herramientas, con el modelo que le hayas configurado',
    strengths: GENERIC_STRENGTHS,
    avoid: GENERIC_AVOID,
    note: 'Antes de usarlo, configúralo una vez (goose configure) para elegir proveedor y modelo.',
    cli: {
      command: 'goose',
      versionArgs: ['--version'],
      promptVia: 'stdin',
      args: ['run', '--no-session', '-q', '-i', '-'],
      modelArgs: ['--model', '{model}'],
      env: { GOOSE_MODE: 'auto', GOOSE_DISABLE_SESSION_NAMING: '1' },
      login: 'goose configure',
      url: 'https://goose-docs.ai/',
      install: {
        windows: ps(
          "$p = Join-Path $env:TEMP 'goose-install.ps1'; Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/aaif-goose/goose/main/download_cli.ps1' -OutFile $p; $env:CONFIGURE = 'false'; & $p"
        ),
        mac: 'curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | CONFIGURE=false bash',
        linux: 'curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | CONFIGURE=false bash'
      }
    }
  },
  {
    id: 'kimi',
    name: 'Kimi Code',
    summary: 'Agente de programación de Moonshot AI (Kimi) en la terminal.',
    account: 'Con tu membresía de Kimi Code (inicio de sesión en el navegador), sin clave de API.',
    kind: 'cli',
    verified: false,
    color: '#4f8cff',
    role: 'Agente conectado: programa en la terminal con tu membresía de Kimi Code',
    strengths: GENERIC_STRENGTHS,
    avoid: [...GENERIC_AVOID, 'no tiene modo de solo lectura: al planificar solo se le pide por instrucción que no toque nada'],
    note: 'Sustituye al antiguo kimi-cli (archivado). Su inicio de sesión por terminal (kimi login) no está en toda su documentación.',
    cli: {
      command: 'kimi',
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['-p', '{prompt}'],
      modelArgs: ['-m', '{model}'],
      env: { KIMI_CODE_NO_AUTO_UPDATE: '1', KIMI_DISABLE_TELEMETRY: '1' },
      authPattern: 'Invalid Authentication|API Key appears to be invalid|unauthenticated|unable to verify your membership',
      quotaPattern: 'reached your (5-hour|weekly|monthly) usage limit|concurrent request limit|too many requests|overloaded',
      login: 'kimi login',
      url: 'https://www.kimi.com/code/docs/en/',
      install: {
        windows: ps('irm https://code.kimi.com/kimi-code/install.ps1 | iex'),
        mac: 'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash',
        linux: 'curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash'
      }
    }
  },
  {
    id: 'mistral-vibe',
    name: 'Mistral Vibe',
    summary: 'Agente de código de Mistral en la terminal.',
    account: 'Con tu cuenta de Mistral (Le Chat Pro o Team) o una clave de API de Mistral; también con modelos locales.',
    kind: 'cli',
    verified: true,
    color: '#ff7000',
    role: 'Agente conectado: programa en la terminal con tu plan de Mistral',
    strengths: GENERIC_STRENGTHS,
    avoid: GENERIC_AVOID,
    note: 'En modo sin pantalla lo más seguro es la clave de API (MISTRAL_API_KEY): la documentación no aclara si basta la sesión de cuenta.',
    cli: {
      command: 'vibe',
      versionArgs: ['--version'],
      promptVia: 'stdin',
      args: ['-p'],
      fullAccessArgs: ['--auto-approve'],
      planArgs: ['--agent', 'plan'],
      login: 'vibe --setup',
      url: 'https://docs.mistral.ai/mistral-vibe/introduction/quickstart',
      install: {
        windows: 'python -m pip install mistral-vibe',
        mac: 'curl -LsSf https://mistral.ai/vibe/install.sh | bash',
        linux: 'curl -LsSf https://mistral.ai/vibe/install.sh | bash',
        needs: 'python'
      }
    }
  },
  {
    id: 'grok',
    name: 'Grok Build',
    summary: 'Agente de programación de xAI (Grok) en la terminal.',
    account: 'Con tu suscripción de SuperGrok o X Premium Plus (inicio de sesión en el navegador), sin clave de API.',
    kind: 'cli',
    verified: true,
    color: '#cfd6e4',
    role: 'Agente conectado: programa en la terminal con tu suscripción de Grok',
    strengths: GENERIC_STRENGTHS,
    avoid: [...GENERIC_AVOID, 'no tiene un modo de solo lectura documentado: al planificar solo se le pide por instrucción que no toque nada'],
    cli: {
      command: 'grok',
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['-p', '{prompt}', '--no-auto-update'],
      fullAccessArgs: ['--always-approve'],
      modelArgs: ['-m', '{model}'],
      authPattern: 'Authentication failed',
      login: 'grok login',
      url: 'https://docs.x.ai/build/overview',
      install: {
        windows: ps('irm https://x.ai/cli/install.ps1 | iex'),
        mac: 'curl -fsSL https://x.ai/cli/install.sh | bash',
        linux: 'curl -fsSL https://x.ai/cli/install.sh | bash'
      }
    }
  },
  {
    id: 'cline',
    name: 'Cline',
    summary: 'Agente de programación autónomo en la terminal, con muchos proveedores de modelos.',
    account: 'Con tu cuenta de Cline o tu suscripción de ChatGPT Plus/Pro (inicio de sesión en el navegador), o una clave de API propia.',
    kind: 'cli',
    verified: false,
    color: '#7bd88f',
    role: 'Agente conectado: programa de forma autónoma en la terminal con el proveedor que le configures',
    strengths: GENERIC_STRENGTHS,
    avoid: GENERIC_AVOID,
    note: 'Antes de usarlo, inicia sesión una vez (cline auth). Su salida en modo sin pantalla no está confirmada del todo.',
    cli: {
      command: 'cline',
      versionArgs: ['--version'],
      promptVia: 'stdin',
      args: [],
      planArgs: ['--plan'],
      fullAccessArgs: ['--yolo'],
      modelArgs: ['--model', '{model}'],
      login: 'cline auth',
      url: 'https://docs.cline.bot/cline-cli/overview',
      install: { windows: 'npm install -g cline', mac: 'npm install -g cline', linux: 'npm install -g cline', needs: 'node' }
    }
  },
  {
    id: 'continue',
    name: 'Continue',
    summary: 'Agente de código de Continue en la terminal (beta).',
    account: 'Con tu cuenta de Continue (inicio de sesión en el navegador) o una clave de API de Anthropic; no usa suscripciones de Claude ni de ChatGPT.',
    kind: 'cli',
    verified: true,
    color: '#5b8def',
    role: 'Agente conectado: programa en la terminal con tu cuenta de Continue',
    strengths: GENERIC_STRENGTHS,
    avoid: GENERIC_AVOID,
    cli: {
      command: 'cn',
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['-p', '{prompt}', '--silent'],
      planArgs: ['--readonly'],
      fullAccessArgs: ['--auto'],
      login: 'cn login',
      url: 'https://docs.continue.dev/cli/quickstart',
      install: {
        windows: ps('irm https://raw.githubusercontent.com/continuedev/continue/main/extensions/cli/scripts/install.ps1 | iex'),
        mac: 'curl -fsSL https://raw.githubusercontent.com/continuedev/continue/main/extensions/cli/scripts/install.sh | bash',
        linux: 'curl -fsSL https://raw.githubusercontent.com/continuedev/continue/main/extensions/cli/scripts/install.sh | bash'
      }
    }
  },
  {
    id: 'openhands',
    name: 'OpenHands',
    summary: 'Agente de desarrollo de software de código abierto (OpenHands).',
    account: 'Con tu cuenta de OpenHands Cloud (inicio de sesión en el navegador) o una clave de API propia.',
    kind: 'cli',
    verified: false,
    color: '#f2c94c',
    role: 'Agente conectado: desarrolla software en la terminal',
    strengths: GENERIC_STRENGTHS,
    avoid: [...GENERIC_AVOID, 'no tiene modo de solo lectura: ejecuta todo sin pedir permiso'],
    note: 'En Windows solo funciona dentro de WSL. Antes de usarlo, inicia sesión una vez (openhands login).',
    cli: {
      command: 'openhands',
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['--headless', '-t', '{prompt}'],
      login: 'openhands login',
      url: 'https://docs.openhands.dev/openhands/usage/cli/installation',
      install: {
        mac: 'curl -fsSL https://install.openhands.dev/install.sh | sh',
        linux: 'curl -fsSL https://install.openhands.dev/install.sh | sh'
      }
    }
  },
  {
    id: 'droid',
    name: 'Factory Droid',
    summary: 'Agente de programación de Factory en la terminal.',
    account: 'Con tu plan de Factory (Pro o superior); en modo sin pantalla pide una clave FACTORY_API_KEY de tu cuenta.',
    kind: 'cli',
    verified: true,
    color: '#ff5d5d',
    role: 'Agente conectado: programa y automatiza proyectos con tu plan de Factory',
    strengths: GENERIC_STRENGTHS,
    avoid: GENERIC_AVOID,
    note: 'Sin una clave FACTORY_API_KEY, la documentación no confirma que la sesión del navegador valga en modo sin pantalla.',
    cli: {
      command: 'droid',
      apiKey: { env: 'FACTORY_API_KEY', label: 'la clave FACTORY_API_KEY de tu cuenta de Factory', url: 'https://app.factory.ai/settings/api-keys' },
      versionArgs: ['--version'],
      promptVia: 'stdin',
      args: ['exec'],
      // Sin ningún nivel, `droid exec` solo lee: para trabajar necesita uno (low edita archivos del proyecto).
      workArgs: ['--auto', 'low'],
      fullAccessArgs: ['--auto', 'medium'],
      modelArgs: ['--model', '{model}'],
      login: 'droid',
      url: 'https://docs.factory.com/cli/droid-exec/overview',
      install: {
        windows: ps('irm https://app.factory.ai/cli/windows | iex'),
        mac: 'curl -fsSL https://app.factory.ai/cli | sh',
        linux: 'curl -fsSL https://app.factory.ai/cli | sh'
      }
    }
  },
  {
    id: 'auggie',
    name: 'Auggie',
    summary: 'Agente de código de Augment en la terminal (beta).',
    account: 'Con tu plan de Augment (inicio de sesión en el navegador).',
    kind: 'cli',
    verified: false,
    color: '#34c0a0',
    role: 'Agente conectado: analiza y modifica bases de código con tu plan de Augment',
    strengths: ['analizar y modificar bases de código grandes con su propio índice del proyecto'],
    avoid: GENERIC_AVOID,
    note: 'En Windows solo figura como compatible con WSL. Cómo aprueba las herramientas en modo sin pantalla no está documentado.',
    cli: {
      command: 'auggie',
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['--print', '--quiet', '{prompt}'],
      modelArgs: ['--model', '{model}'],
      login: 'auggie login',
      url: 'https://docs.augmentcode.com/cli/overview',
      install: {
        windows: 'npm install -g @augmentcode/auggie',
        mac: 'npm install -g @augmentcode/auggie',
        linux: 'npm install -g @augmentcode/auggie',
        needs: 'node'
      }
    }
  },
  {
    id: 'junie',
    name: 'Junie',
    summary: 'Agente de código de JetBrains en la terminal.',
    account: 'Con tu suscripción de JetBrains AI (cuenta de JetBrains), una clave de API de Junie o tus propias claves.',
    kind: 'cli',
    verified: false,
    color: '#21d789',
    role: 'Agente conectado: escribe, revisa y modifica código con tu suscripción de JetBrains',
    strengths: GENERIC_STRENGTHS,
    avoid: [...GENERIC_AVOID, 'no está documentado qué hace en modo sin pantalla cuando una acción pide aprobación'],
    note: 'La documentación pide una clave JUNIE_API_KEY en modo sin pantalla y no confirma que reutilice la sesión de la cuenta. Ejecuta lo del proyecto sin preguntar: úsalo en proyectos de confianza.',
    cli: {
      command: 'junie',
      apiKey: { env: 'JUNIE_API_KEY', label: 'la clave JUNIE_API_KEY', url: 'https://junie.jetbrains.com/docs/junie-headless.html' },
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['--task', '{prompt}', '--skip-update-check'],
      modelArgs: ['--model', '{model}'],
      login: 'junie',
      url: 'https://junie.jetbrains.com/docs/junie-cli.html',
      install: {
        windows: ps("iex (irm 'https://junie.jetbrains.com/install.ps1')"),
        mac: 'curl -fsSL https://junie.jetbrains.com/install.sh | bash',
        linux: 'curl -fsSL https://junie.jetbrains.com/install.sh | bash'
      }
    }
  },
  {
    id: 'crush',
    name: 'Crush',
    summary: 'Agente de programación de Charm con interfaz de terminal.',
    account: 'Con tu cuenta de GitHub Copilot, ChatGPT o Grok (crush login), Charm Hyper o claves de API propias.',
    kind: 'cli',
    verified: true,
    color: '#ff5fa2',
    role: 'Agente conectado: programa en la terminal con tu suscripción de Copilot, ChatGPT o Grok',
    strengths: GENERIC_STRENGTHS,
    avoid: [...GENERIC_AVOID, 'no tiene modo de solo lectura: aprueba todo por sí solo'],
    note: 'Crea una carpeta .crush/ en el proyecto con sus datos y registros.',
    cli: {
      command: 'crush',
      versionArgs: ['--version'],
      promptVia: 'stdin',
      args: ['run', '--quiet'],
      modelArgs: ['--model', '{model}'],
      authPattern: "no providers configured|please run 'crush' to set up a provider",
      login: 'crush login',
      url: 'https://github.com/charmbracelet/crush',
      install: {
        windows: 'winget install -e --id charmbracelet.crush --accept-package-agreements --accept-source-agreements --disable-interactivity',
        mac: 'brew install charmbracelet/tap/crush',
        linux: 'npm install -g @charmland/crush',
        needs: 'node'
      }
    }
  },
  {
    id: 'open-interpreter',
    name: 'Open Interpreter',
    summary: 'Agente que trabaja con archivos, código y comandos locales (la versión nueva, basada en Codex).',
    account: 'Con tu cuenta de ChatGPT (inicio de sesión en el navegador), claves de API o modelos locales.',
    kind: 'cli',
    verified: false,
    color: '#a0a8ff',
    role: 'Agente conectado: trabaja con archivos, código y comandos con tu cuenta de ChatGPT',
    strengths: GENERIC_STRENGTHS,
    avoid: GENERIC_AVOID,
    note: 'Es el Open Interpreter nuevo (en Rust): si tienes instalado el antiguo de Python, comparten el nombre del comando.',
    cli: {
      command: 'interpreter',
      versionArgs: ['--version'],
      promptVia: 'stdin',
      args: ['exec', '--skip-git-repo-check', '--color', 'never', '-'],
      planArgs: ['--sandbox', 'read-only'],
      workArgs: ['--sandbox', 'workspace-write'],
      fullAccessArgs: ['--dangerously-bypass-approvals-and-sandbox'],
      modelArgs: ['--model', '{model}'],
      login: 'interpreter login',
      authCheck: 'interpreter login status',
      url: 'https://www.openinterpreter.com/docs/terminal/quickstart',
      install: {
        windows: ps('irm https://www.openinterpreter.com/install.ps1 | iex'),
        mac: 'curl -fsSL https://www.openinterpreter.com/install | sh',
        linux: 'curl -fsSL https://www.openinterpreter.com/install | sh'
      }
    }
  },
  {
    id: 'gptme',
    name: 'gptme',
    summary: 'Asistente con herramientas para ejecutar código y manejar archivos desde la terminal.',
    account: 'Con tu suscripción de ChatGPT Plus/Pro o SuperGrok, o claves de API (no con la suscripción de Claude).',
    kind: 'cli',
    verified: true,
    color: '#7fd1ff',
    role: 'Agente conectado: ejecuta código y maneja archivos con tu suscripción de ChatGPT o Grok',
    strengths: GENERIC_STRENGTHS,
    avoid: [...GENERIC_AVOID, 'sin aprobaciones ni sandbox: ejecuta todo lo que decide'],
    note: 'En Windows solo funciona dentro de WSL o Docker.',
    cli: {
      command: 'gptme',
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['-n', '{prompt}'],
      planArgs: ['-t', 'read-only'],
      modelArgs: ['-m', '{model}'],
      login: 'gptme-auth openai-subscription',
      url: 'https://gptme.org/docs/getting-started.html',
      install: {
        mac: 'pipx install gptme',
        linux: 'pipx install gptme',
        needs: 'python'
      }
    }
  },
  {
    id: 'letta',
    name: 'Letta Code',
    summary: 'Agente de código con memoria persistente entre sesiones.',
    account: 'Con tu cuenta de Letta o, con «letta connect», tu suscripción de ChatGPT, GitHub Copilot, Kimi, xAI…',
    kind: 'cli',
    verified: true,
    color: '#b583ff',
    role: 'Agente conectado: programa con memoria propia que persiste entre tareas',
    strengths: ['programar recordando lo aprendido del proyecto: tiene su propia memoria entre sesiones'],
    avoid: GENERIC_AVOID,
    note: 'Por defecto reutiliza el último agente (y su memoria) de la carpeta. Inicia sesión una vez (letta, y /login).',
    cli: {
      command: 'letta',
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['-p', '{prompt}'],
      planArgs: ['--tools', 'Read,Glob,Grep'],
      fullAccessArgs: ['--yolo'],
      modelArgs: ['--model', '{model}'],
      login: 'letta',
      url: 'https://docs.letta.com/letta-code/headless/',
      install: {
        windows: 'npm install -g @letta-ai/letta-code',
        mac: 'npm install -g @letta-ai/letta-code',
        linux: 'npm install -g @letta-ai/letta-code',
        needs: 'node'
      }
    }
  },
  {
    id: 'forge',
    name: 'ForgeCode',
    summary: 'Agente de programación con distintos proveedores de IA.',
    account: 'Con tu suscripción de Claude Code, Codex (ChatGPT) o GitHub Copilot (forge provider login) o claves de API.',
    kind: 'cli',
    verified: false,
    color: '#ffb347',
    role: 'Agente conectado: programa en la terminal con tu suscripción de Claude, ChatGPT o Copilot',
    strengths: GENERIC_STRENGTHS,
    avoid: GENERIC_AVOID,
    note: 'El modelo se elige con «forge config set model» (no tiene opción por consulta). Su salida sin pantalla no está confirmada.',
    cli: {
      command: 'forge',
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['-p', '{prompt}'],
      login: 'forge provider login',
      url: 'https://github.com/antinomyhq/forge',
      install: {
        windows: 'npm install -g forgecode',
        mac: 'curl -fsSL https://forgecode.dev/cli | sh',
        linux: 'curl -fsSL https://forgecode.dev/cli | sh'
      }
    }
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    summary: 'Asistente personal con herramientas (no solo de código), con su propia puerta de enlace.',
    account: 'Con tu suscripción de ChatGPT/Codex o GitHub Copilot, o reutilizando el programa de Claude ya iniciado; también claves de API.',
    kind: 'cli',
    verified: true,
    color: '#ff5b5b',
    role: 'Agente conectado: asistente personal con herramientas y automatización',
    strengths: ['tareas de asistente personal y automatización con herramientas'],
    avoid: GENERIC_AVOID,
    note: 'Inicia sesión una vez con tu proveedor (el botón abre «openclaw models auth login»).',
    cli: {
      command: 'openclaw',
      versionArgs: ['--version'],
      promptVia: 'stdin',
      args: ['agent', 'exec', '--message-file', '-'],
      modelArgs: ['--model', '{model}'],
      env: { NO_COLOR: '1' },
      login: 'openclaw models auth login --provider openai',
      authCheck: 'openclaw models status --check',
      url: 'https://docs.openclaw.ai/cli/agent.md',
      install: {
        windows: ps('iwr -useb https://openclaw.ai/install.ps1 | iex'),
        mac: 'curl -fsSL https://openclaw.ai/install.sh | bash',
        linux: 'curl -fsSL https://openclaw.ai/install.sh | bash'
      }
    }
  },
  {
    id: 'kiro',
    name: 'Kiro CLI',
    summary: 'Agente de código de AWS (Kiro, antes Amazon Q Developer CLI) en la terminal.',
    account: 'Con tu suscripción de Kiro (kiro-cli login, en el navegador) o una clave KIRO_API_KEY (planes Pro o superiores) para el modo sin pantalla.',
    kind: 'cli',
    verified: false,
    color: '#9b6bff',
    role: 'Agente conectado: programa en la terminal con tu suscripción de Kiro',
    strengths: GENERIC_STRENGTHS,
    avoid: [
      ...GENERIC_AVOID,
      'no tiene un modo de solo lectura documentado: al planificar no se le aprueba ninguna herramienta y solo se le pide por instrucción que no toque nada'
    ],
    note:
      'Vale la sesión de «kiro-cli login» (se comprueba con kiro-cli whoami, sin confirmar) o la clave KIRO_API_KEY, que su documentación pide para el modo sin pantalla. En el proyecto se le aprueban leer, buscar y escribir (--trust-tools); con acceso completo, todo. Kiro CLI 3.0 pasa los permisos a permissions.yaml y esas opciones pueden cambiar. Si lo añadiste antes, quítalo y vuelve a añadirlo para coger estos cambios.',
    cli: {
      command: 'kiro-cli',
      apiKey: { env: 'KIRO_API_KEY', label: 'la clave KIRO_API_KEY de tu cuenta de Kiro', url: 'https://app.kiro.dev' },
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['chat', '--no-interactive', '{prompt}'],
      // Sin herramientas aprobadas, en modo sin pantalla se deniega lo que pediría permiso: para editar hay que aprobar escribir.
      workArgs: ['--trust-tools=read,grep,write'],
      fullAccessArgs: ['--trust-all-tools'],
      login: 'kiro-cli login',
      authCheck: 'kiro-cli whoami',
      url: 'https://kiro.dev/docs/cli/headless/',
      install: {
        windows: ps("irm 'https://cli.kiro.dev/install.ps1' | iex"),
        mac: 'curl -fsSL https://cli.kiro.dev/install | bash',
        linux: 'curl -fsSL https://cli.kiro.dev/install | bash'
      }
    }
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    summary: 'Agente de programación de código abierto de Qwen (Alibaba) en la terminal.',
    account:
      'Con tu Qwen Coding Plan de Alibaba Cloud (su clave y el endpoint https://coding.dashscope.aliyuncs.com/v1, o coding-intl fuera de China) u otro proveedor (OpenAI, Anthropic, OpenRouter, modelos locales). El acceso gratuito con la cuenta de Qwen cerró en abril de 2026.',
    kind: 'cli',
    verified: true,
    color: '#7c5cff',
    role: 'Agente conectado: programa en la terminal con tu Qwen Coding Plan',
    strengths: GENERIC_STRENGTHS,
    avoid: GENERIC_AVOID,
    note: 'Configúralo una vez: el botón abre «qwen»; dentro, /auth y elige Coding Plan con la clave del plan (o tu proveedor). «qwen auth» ya no existe. Es el programa qwen, no el agente local «Qwen» de Ollama.',
    cli: {
      command: 'qwen',
      versionArgs: ['--version'],
      // El encargo entra por stdin y Qwen Code lo antepone al texto de -p.
      promptVia: 'stdin',
      args: ['-p', 'Follow the instructions above.'],
      planArgs: ['--approval-mode', 'plan'],
      workArgs: ['--approval-mode', 'auto-edit'],
      fullAccessArgs: ['--approval-mode', 'yolo'],
      modelArgs: ['-m', '{model}'],
      login: 'qwen',
      url: 'https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/',
      install: {
        windows: ps('irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex'),
        mac: 'curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash',
        linux: 'curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash'
      }
    }
  },
  {
    id: 'antigravity',
    name: 'Antigravity CLI',
    summary: 'El agente de Google Antigravity en la terminal (agy); sustituye a Gemini CLI en las cuentas de Google AI Pro y Ultra.',
    account: 'Con tu cuenta de Google con Google AI Pro o Ultra (inicio de sesión de Google en el navegador la primera vez que abres agy).',
    kind: 'cli',
    verified: false,
    color: '#4285f4',
    role: 'Agente conectado: programa en la terminal con tu suscripción de Google AI',
    strengths: GENERIC_STRENGTHS,
    avoid: [
      ...GENERIC_AVOID,
      'sin acceso completo no puede editar: en modo sin pantalla deniega en silencio lo que pediría permiso',
      'no tiene un modo de solo lectura documentado: al planificar solo se le pide por instrucción que no toque nada'
    ],
    note:
      'La versión 1.0.6 falla con -p cuando no hay terminal (así lo lanza AI Cowork): actualízalo. Sus condiciones adicionales (§6) prohíben acceder al servicio con software de terceros y Google no ha aclarado si eso incluye lanzarlo así con una cuenta personal. La dirección del instalador no está confirmada en su documentación.',
    cli: {
      command: 'agy',
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['-p', '{prompt}'],
      fullAccessArgs: ['--dangerously-skip-permissions'],
      login: 'agy',
      url: 'https://antigravity.google/docs/cli/headless/',
      install: {
        windows: ps('irm https://antigravity.google/cli/install.ps1 | iex'),
        mac: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
        linux: 'curl -fsSL https://antigravity.google/cli/install.sh | bash'
      }
    }
  },
  {
    id: 'rovodev',
    name: 'Rovo Dev',
    summary: 'El agente de programación de Atlassian (Rovo Dev) en la terminal, dentro de la CLI de Atlassian (acli).',
    account: 'Con tu cuenta de Atlassian con Rovo Dev en tu sitio de Atlassian Cloud (acli rovodev auth login, con tu correo y un token de API).',
    kind: 'cli',
    verified: false,
    color: '#1868db',
    role: 'Agente conectado: programa en la terminal con tu plan de Rovo Dev de Atlassian',
    strengths: [...GENERIC_STRENGTHS, 'tareas ligadas a Jira, Confluence o Bitbucket de tu sitio de Atlassian'],
    avoid: [...GENERIC_AVOID, 'no tiene un modo de solo lectura documentado: al planificar solo se le pide por instrucción que no toque nada'],
    note:
      'Una guía de terceros dice que el encargo de «acli rovodev run» no puede pasar de 256 caracteres: AI Cowork solo le pasa la instrucción de leer el archivo del encargo, pero con rutas muy largas podría no caber (sin comprobar). En Windows y Linux, instala la CLI de Atlassian (acli) desde su página.',
    cli: {
      command: 'acli',
      versionArgs: ['--version'],
      promptVia: 'arg',
      args: ['rovodev', 'run', '{prompt}'],
      fullAccessArgs: ['--yolo'],
      login: 'acli rovodev auth login',
      url: 'https://support.atlassian.com/rovo/docs/rovo-dev-cli-commands/',
      install: {
        mac: 'brew tap atlassian/homebrew-acli && brew install acli'
      }
    }
  },
  {
    id: 'minimax',
    name: 'MiniMax Code',
    summary: 'Agente de programación de MiniMax en la terminal (mcode).',
    account: 'Con tu cuenta de MiniMax (mcode login, en el navegador); también con otros proveedores que le añadas.',
    kind: 'cli',
    verified: true,
    color: '#ff4f6d',
    role: 'Agente conectado: programa en la terminal con tu cuenta de MiniMax',
    strengths: GENERIC_STRENGTHS,
    avoid: [...GENERIC_AVOID, 'no tiene modo de solo lectura en «mcode exec»: al planificar solo se le pide por instrucción que no toque nada'],
    note: 'Necesita Node.js 22.19 o superior (o 24–26). El botón inicia sesión con una cuenta internacional (--region global); las cuentas de China continental usan «mcode login».',
    cli: {
      command: 'mcode',
      versionArgs: ['--version'],
      promptVia: 'stdin',
      args: ['exec', '--input', '-'],
      fullAccessArgs: ['--permission', 'full'],
      modelArgs: ['--model', '{model}'],
      authPattern: 'authentication required|mcode login',
      login: 'mcode login --region global',
      url: 'https://agent.minimax.io/docs/cli/quick-start',
      install: {
        windows: MCODE_NPM,
        mac: MCODE_NPM,
        linux: MCODE_NPM,
        needs: 'node'
      }
    }
  },
  {
    id: 'qoder',
    name: 'Qoder CLI',
    summary: 'Agente de programación de Qoder (Alibaba) en la terminal.',
    account: 'Con tu cuenta de Qoder (qodercli login, en el navegador) o un token personal QODER_PERSONAL_ACCESS_TOKEN.',
    kind: 'cli',
    verified: true,
    color: '#2ecc9a',
    role: 'Agente conectado: programa en la terminal con tu cuenta de Qoder',
    strengths: GENERIC_STRENGTHS,
    avoid: GENERIC_AVOID,
    note: 'Se lanza como «qodercli»: el comando «qoder» del paquete reparte entre la CLI y el editor Qoder. Sin navegador vale un token personal (QODER_PERSONAL_ACCESS_TOKEN) en el entorno del equipo.',
    cli: {
      command: 'qodercli',
      versionArgs: ['--version'],
      // Sin terminal, -p lee el encargo de stdin.
      promptVia: 'stdin',
      args: ['-p'],
      planArgs: ['--permission-mode', 'plan'],
      // En modo sin pantalla se deniega lo que pediría permiso: para editar hay que aceptar las ediciones.
      workArgs: ['--permission-mode', 'accept_edits'],
      fullAccessArgs: ['--yolo'],
      modelArgs: ['-m', '{model}'],
      authPattern: 'Not logged in',
      login: 'qodercli login',
      url: 'https://docs.qoder.com/cli/headless',
      install: {
        windows: 'npm install -g @qoder-ai/qodercli',
        mac: 'npm install -g @qoder-ai/qodercli',
        linux: 'npm install -g @qoder-ai/qodercli',
        needs: 'node'
      }
    }
  }
]
