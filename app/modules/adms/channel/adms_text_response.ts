import type { HttpContext } from '@adonisjs/core/http'

/**
 * Unica salida del canal ADMS. Texto plano UTF-8, sin cache y sin cookies: el
 * equipo no es un navegador y un JSON o un HTML lo rompe (spec v2, 4.1).
 */
export function sendText(response: HttpContext['response'], status: number, body: string): void {
  response.status(status)
  response.header('Content-Type', 'text/plain; charset=utf-8')
  response.header('Cache-Control', 'private, no-store')
  response.send(body)
}
