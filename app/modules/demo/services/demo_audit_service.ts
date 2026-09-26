import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import { resolveMailSender } from '#helpers/resolve_mail_sender'

export type DemoAuditResult =
  | 'exito'
  | 'fallo'
  | 'fallo_permisos'
  | 'fallo_db'
  | 'rate_limit'

export interface DemoAuditPayload {
  ip: string
  userAgent: string
  userId?: number | null
  resultado: DemoAuditResult
  motivo?: string
}

export default class DemoAuditService {
  async log(payload: DemoAuditPayload): Promise<void> {
    const to = env.get('DEMO_AUDIT_EMAIL', 'desarrollo-software@gruposti.com')
    const timestamp = new Date().toISOString()

    const resultadoLabel: Record<DemoAuditResult, string> = {
      exito:           'ÉXITO',
      fallo:           'FALLO (password incorrecta)',
      fallo_permisos:  'FALLO (permisos insuficientes)',
      fallo_db:        'FALLO (DB no autorizada)',
      rate_limit:      'BLOQUEADO (rate limit)',
    }

    const body = [
      'Endpoint: POST /api/generate-demo-v2',
      `Timestamp: ${timestamp}`,
      `IP origen: ${payload.ip}`,
      `User-Agent: ${payload.userAgent}`,
      `Usuario autenticado (GID): ${payload.userId ?? 'no autenticado'}`,
      `Resultado: ${resultadoLabel[payload.resultado]}`,
      payload.motivo ? `Motivo: ${payload.motivo}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      await mail.send((message) => {
        message
          .to(to)
          .from(resolveMailSender())
          .subject(`[DEMO AUDIT] ${resultadoLabel[payload.resultado]} - ${timestamp}`)
          .text(body)
      })
    } catch {
      // El audit nunca debe bloquear la respuesta al cliente
    }
  }
}
