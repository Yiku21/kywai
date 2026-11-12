// La ventana de terminal de «Iniciar sesión», explicada paso a paso. Antes, kywai abría una terminal vacía con la
// orden del agente (por ejemplo «claude auth login») y quien no había usado nunca una terminal no sabía qué hacer.
// Ahora la ventana empieza con un título, los pasos de ese agente (src/shared/loginGuide.ts, los mismos que enseña el
// asistente) y consejos para pegar; luego ejecuta la orden y al final dice si salió bien y que se puede cerrar.
//
// Se escribe como un archivo (.sh en Mac y Linux, .cmd en Windows) en la carpeta temporal, para no tener que meter
// todo el texto entre comillas en la orden que abre la terminal.
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tr } from '@shared/i18n'
import { loginSteps, pasteHint, type LoginPlatform } from '@shared/loginGuide'
import type { SetupToolId } from '@shared/types'

export interface LoginGuideText {
  title: string
  header: string[]
  ok: string[]
  fail: string[]
}

/** Los textos de la ventana: cabecera con los pasos, y el final si salió bien o mal. */
export function loginGuideText(id: SetupToolId, label: string, p: LoginPlatform): LoginGuideText {
  const steps = loginSteps(id, label, p)
  const rule = '─'.repeat(60)
  return {
    title: `kywai - ${label}`,
    header: [
      rule,
      `  kywai · ${tr('Conectar {label}', { label })}`,
      rule,
      '',
      tr('Sigue estos pasos. kywai no ve ni guarda tus contraseñas.'),
      '',
      ...steps.map((s, i) => `  ${i + 1}. ${s}`),
      '',
      tr('Consejos:'),
      `  · ${tr('Para pegar en esta ventana: {paste}.', { paste: pasteHint(p) })}`,
      `  · ${tr('Si escribes una contraseña o una clave, puede que no se vea nada mientras escribes: es normal.')}`,
      `  · ${tr('Si se queda parada mucho rato, pulsa Intro.')}`,
      '',
      rule,
      ''
    ],
    ok: ['', rule, `  ✓ ${tr('Listo. Vuelve a kywai: comprobará solo que {label} quedó conectado.', { label })}`, `    ${tr('Ya puedes cerrar esta ventana.')}`, rule],
    fail: [
      '',
      rule,
      `  ✗ ${tr('No terminó bien. Cierra esta ventana y vuelve a pulsar «Iniciar sesión» en kywai.')}`,
      `    ${tr('Si vuelve a fallar, haz una captura de esta ventana: te servirá para pedir ayuda.')}`,
      rule
    ]
  }
}

/** Texto seguro dentro de un heredoc con comillas simples: solo hay que evitar la línea que lo cierra. */
const HEREDOC = 'KYWAI_GUIA_FIN'

function bashScript(text: LoginGuideText, cmd: string): string {
  const block = (lines: string[]) => `cat <<'${HEREDOC}'\n${lines.filter((l) => l !== HEREDOC).join('\n')}\n${HEREDOC}`
  return [
    '#!/usr/bin/env bash',
    `# ${text.title} (lo creó kywai al pulsar «Iniciar sesión»)`,
    'clear 2>/dev/null',
    `printf '\\033]0;%s\\007' '${text.title.replace(/'/g, `'\\''`)}'`,
    block(text.header),
    cmd,
    'if [ $? -eq 0 ]; then',
    block(text.ok),
    'else',
    block(text.fail),
    'fi',
    ''
  ].join('\n')
}

/** Una línea de texto para «echo» en cmd.exe: los caracteres que la consola interpreta van escapados. */
export function cmdEcho(line: string): string {
  if (!line) return 'echo.'
  return `echo(${line.replace(/\^/g, '^^').replace(/[&|<>]/g, (c) => `^${c}`).replace(/%/g, '%%')}`
}

function cmdScript(text: LoginGuideText, cmd: string): string {
  return [
    '@echo off',
    // UTF-8 para los acentos y las flechas; las líneas siguientes ya se leen así.
    'chcp 65001 >nul',
    `title ${text.title.replace(/[&|<>^%]/g, '')}`,
    'cls',
    ...text.header.map(cmdEcho),
    `call ${cmd}`,
    'if errorlevel 1 goto kywai_fallo',
    ...text.ok.map(cmdEcho),
    'goto :eof',
    ':kywai_fallo',
    ...text.fail.map(cmdEcho),
    ''
  ].join('\r\n')
}

/** El contenido del archivo que abre la terminal de cada sistema. */
export function loginScript(id: SetupToolId, label: string, p: LoginPlatform, cmd: string): string {
  const text = loginGuideText(id, label, p)
  return p === 'win' ? cmdScript(text, cmd) : bashScript(text, cmd)
}

/** Escribe el archivo en la carpeta temporal y devuelve su ruta. */
export function writeLoginScript(id: SetupToolId, label: string, p: LoginPlatform, cmd: string, dir = join(tmpdir(), 'kywai-login')): string {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${id.replace(/[^\w-]/g, '_')}.${p === 'win' ? 'cmd' : 'sh'}`)
  writeFileSync(file, loginScript(id, label, p, cmd), { encoding: 'utf8', mode: 0o700 })
  return file
}
