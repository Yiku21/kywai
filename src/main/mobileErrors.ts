import type { ServerResponse } from 'node:http'

export class MobileError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly retryable = false) {
    super(message)
  }
}

export function mobileErrorBody(error: unknown): { code: string; message: string; retryable: boolean } {
  const e = error instanceof MobileError ? error : new MobileError(500, 'INTERNAL_ERROR', 'No se pudo completar la operación', true)
  return { code: e.code, message: e.message, retryable: e.retryable }
}

export function mobileJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {})
  })
  res.end(JSON.stringify(data))
}
