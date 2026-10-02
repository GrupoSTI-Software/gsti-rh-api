import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import PiiAccessLogService from '#services/pii_access_log_service'
import type { BadgeEmployeeContext } from './dto/badge.dto.js'

/** Quién genera el gafete, tal como lo pide la bitácora de PII. */
export interface BadgeAccessor {
  userId: number
  ip: string
  userAgent: string | null
  requestId: string | null
  originModule: string | null
}

/** Sanea el header `X-Origin-Module`; valores inválidos se descartan sin bloquear la descarga. */
function normalizeOriginModule(raw: string | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(trimmed)) return null
  return trimmed
}

/**
 * Datos del solicitante para la bitácora, leídos de la petición autenticada.
 *
 * @param ctx - Contexto HTTP con `auth.user` ya resuelto por el middleware.
 */
export function badgeAccessorFromRequest(ctx: HttpContext): BadgeAccessor {
  const { request } = ctx
  return {
    userId: ctx.auth.user!.userId,
    ip: request.ip(),
    userAgent: request.header('User-Agent') ?? null,
    requestId: request.id() ?? null,
    originModule: normalizeOriginModule(request.header('X-Origin-Module')),
  }
}

/**
 * Registra en la bitácora de PII cada gafete que imprime el NSS.
 *
 * El gafete descargable lleva el NSS completo por decisión de producto
 * (2026-09-23), y lo genera quien tiene `generate-badges`, que no es el
 * permiso de lectura de identificación. La bitácora es el control
 * compensatorio: un asiento por empleado cuyo NSS sale impreso, escrito
 * **antes** de entregar el archivo y en una sola transacción. Si el registro
 * falla, el llamador no entrega el gafete.
 */
export default class BadgeNssAuditService {
  constructor(private readonly piiAccessLogService: PiiAccessLogService = new PiiAccessLogService()) {}

  /**
   * @param contexts - Empleados cuyos gafetes se van a entregar.
   * @param accessor - Quién los genera.
   * @throws Si no se pudo escribir la bitácora; en ese caso no se entrega nada.
   */
  async recordNssDisclosures(
    contexts: BadgeEmployeeContext[],
    accessor: BadgeAccessor
  ): Promise<void> {
    const withNss = contexts.filter((context) => !!context.nss)
    if (withNss.length === 0) return

    await db.transaction(async (trx) => {
      for (const context of withNss) {
        await this.piiAccessLogService.record(
          {
            businessUnitId: context.businessUnitId,
            accessorUserId: accessor.userId,
            model: 'Person',
            modelColumn: 'personImssNss',
            recordId: context.personId,
            subjectEmployeeId: context.employeeId,
            accessorIp: accessor.ip,
            accessorUserAgent: accessor.userAgent,
            requestId: accessor.requestId,
            originModule: accessor.originModule,
          },
          trx
        )
      }
    })
  }
}
