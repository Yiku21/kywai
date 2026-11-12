import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { setCurrentLang } from '@shared/i18n'
import { browserPlatform, loginSteps, pasteHint, platformOf } from '@shared/loginGuide'
import { cmdEcho, loginGuideText, loginScript, writeLoginScript } from './loginScript'

describe('pasos de inicio de sesión', () => {
  afterEach(() => setCurrentLang('es'))

  it('cada agente conocido tiene sus pasos y el resto, unos generales con su nombre', () => {
    for (const id of ['claude', 'codex', 'gemini', 'hermes', 'muse'] as const) expect(loginSteps(id, id, 'mac').length).toBeGreaterThanOrEqual(2)
    const generic = loginSteps('cli:kilo', 'Kilo CLI', 'linux')
    expect(generic[0]).toContain('Kilo CLI')
    expect(generic.join(' ')).toContain('Ctrl + Mayús + V')
  })

  it('dice cómo pegar en la terminal de cada sistema', () => {
    expect(pasteHint('win')).toContain('clic derecho')
    expect(pasteHint('mac')).toContain('⌘')
    expect(loginSteps('claude', 'Claude Code', 'win')[1]).toContain('clic derecho')
    expect(platformOf('win32')).toBe('win')
    expect(platformOf('darwin')).toBe('mac')
    expect(platformOf('linux')).toBe('linux')
    expect(['win', 'mac', 'linux']).toContain(browserPlatform())
  })

  it('a Gemini le recomienda primero la clave de AI Studio', () => {
    expect(loginSteps('gemini', 'Gemini CLI', 'mac')[0]).toContain('aistudio.google.com/apikey')
  })

  it('sale en el idioma de la app', () => {
    setCurrentLang('en')
    expect(loginSteps('codex', 'Codex CLI', 'mac')[0]).toContain('ChatGPT account')
    expect(loginGuideText('codex', 'Codex CLI', 'mac').ok.join('\n')).toContain('You can close this window now.')
  })
})

describe('ventana de inicio de sesión', () => {
  it('Mac y Linux: explica los pasos, ejecuta la orden y dice si salió bien', () => {
    const script = loginScript('claude', 'Claude Code', 'mac', 'claude auth login')
    expect(script.startsWith('#!/usr/bin/env bash')).toBe(true)
    const steps = script.indexOf('1. Se abrirá tu navegador')
    const cmd = script.indexOf('\nclaude auth login\n')
    expect(steps).toBeGreaterThan(0)
    expect(cmd).toBeGreaterThan(steps)
    expect(script).toContain('Listo. Vuelve a kywai')
    expect(script).toContain('No terminó bien')
  })

  it('el script de bash funciona: enseña los pasos y el final según cómo acabe la orden', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kywai-login-'))
    const ok = writeLoginScript('cli:demo', "Demo's CLI", 'linux', 'echo ORDEN-EJECUTADA', dir)
    expect(statSync(ok).mode & 0o100).toBeTruthy()
    const out = execFileSync('bash', [ok], { encoding: 'utf8', env: { ...process.env, TERM: 'dumb' } })
    expect(out).toContain("Conectar Demo's CLI")
    expect(out).toContain('ORDEN-EJECUTADA')
    expect(out).toContain('✓ Listo')
    const bad = writeLoginScript('cli:malo', 'Malo', 'linux', 'false', dir)
    const outBad = execFileSync('bash', [bad], { encoding: 'utf8', env: { ...process.env, TERM: 'dumb' } })
    expect(outBad).toContain('✗ No terminó bien')
    expect(outBad).not.toContain('✓ Listo')
  })

  it('Windows: archivo .cmd en UTF-8, con la orden con «call» y el texto escapado', () => {
    const script = loginScript('codex', 'Codex CLI', 'win', 'codex login')
    expect(script.split('\r\n').slice(0, 2)).toEqual(['@echo off', 'chcp 65001 >nul'])
    expect(script).toContain('\r\ncall codex login\r\nif errorlevel 1 goto kywai_fallo\r\n')
    expect(script).not.toMatch(/^echo\(.*[^^][&|<>]/m)
    expect(cmdEcho('')).toBe('echo.')
    expect(cmdEcho('A & B | C > D < E 100% ^')).toBe('echo(A ^& B ^| C ^> D ^< E 100%% ^^')
  })

  it('se guarda en la carpeta temporal con un nombre por agente', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kywai-login-'))
    const file = writeLoginScript('cli:some/thing', 'X', 'win', 'x login', dir)
    expect(file).toBe(join(dir, 'cli_some_thing.cmd'))
    expect(readFileSync(file, 'utf8')).toContain('call x login')
  })
})
