import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { folderService, onMacPermissionPrompt, parsePromptLine, serviceLabel, waitForFolderAccess } from './macPermissions'

const line = (msg: string): string => JSON.stringify({ subsystem: 'com.apple.TCC', eventMessage: msg })
const PROMPT =
  'AUTHREQ_PROMPTING: msgID=25516.15, service=kTCCServiceSystemPolicyDocumentsFolder, subject=Sub:{com.aicowork.app}Resp:{TCCDProcess: identifier=com.aicowork.app, pid=25454, auid=501, euid=501, responsible_path=/Applications/AI Cowork.app/Contents/MacOS/AI Cowork}'

describe('avisos de privacidad de macOS', () => {
  it('reconoce la ventana que AI Cowork tiene pendiente y la nombra en español', () => {
    expect(parsePromptLine(line(PROMPT))).toEqual({
      service: 'kTCCServiceSystemPolicyDocumentsFolder',
      serviceLabel: 'Documentos',
      detail: 'macOS pide permiso para Documentos en la pantalla del Mac'
    })
  })

  it('ignora las de otras apps y el resto del registro', () => {
    expect(parsePromptLine(line(PROMPT.replaceAll('com.aicowork.app', 'com.anthropic.claude-code')))).toBeNull()
    expect(parsePromptLine(line('AUTHREQ_RESULT: msgID=25516.15, authValue=2, authReason=2'))).toBeNull()
    expect(parsePromptLine('Filtering the log data using "subsystem == ..."')).toBeNull()
  })

  it('sabe qué carpetas protege macOS una a una', () => {
    expect(folderService('/Users/usuario/Documents/PROYECTO', '/Users/usuario')).toBe('kTCCServiceSystemPolicyDocumentsFolder')
    expect(folderService('/Users/usuario/Downloads', '/Users/usuario')).toBe('kTCCServiceSystemPolicyDownloadsFolder')
    expect(folderService('/Volumes/Disco/x', '/Users/usuario')).toBe('kTCCServiceSystemPolicyRemovableVolumes')
    expect(folderService('/Users/usuario/DocumentsViejos', '/Users/usuario')).toBeNull()
    expect(serviceLabel('kTCCServiceMicrophone')).toBe('micrófono')
  })

  it('una carpeta accesible no espera ni avisa', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aicw-tcc-'))
    const seen: string[] = []
    const off = onMacPermissionPrompt((p) => seen.push(p.service))
    try {
      const res = await waitForFolderAccess(dir, { signal: new AbortController().signal, onWaiting: (t) => seen.push(t) })
      expect(res).toBeNull()
      expect(seen).toEqual([])
    } finally {
      off()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
