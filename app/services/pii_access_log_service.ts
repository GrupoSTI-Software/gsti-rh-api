import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import PiiAccessLog from '#models/pii_access_log'
import type { PiiAccessInputInterface } from '../interfaces/pii_access_input_interface.js'
import type { PiiAccessLogsFiltersInterface } from '../interfaces/pii_access_logs_filters_interface.js'

/**
 * Servicio de auditoría de accesos a datos personales sensibles.
 *
 * Responsabilidad única: escribir la fila de auditoría de forma fail-closed.
 *
 * **Patrón de uso (E5 — reveal):**
 * ```typescript
 * const revealedValue = await db.transaction(async (trx) => {
 *   await piiAccessLogService.record(input, trx)   // ← log primero
 *   const row = await Model.query({ client: trx }).where(...).firstOrFail()
 *   return row.sensitiveField                       // ← dato después
 * })
 * // Si el log falla → excepción → rollback → el dato NUNCA sale.
 * ```
 *
 * **Invariantes:**
 *   - Solo emite INSERT; jamás UPDATE ni DELETE.
 *   - Si se provee `trx`, opera dentro de esa transacción (fail-closed garantizado
 *     cuando el caller combina el log con la consulta en la misma transacción).
 *   - Si no se provee `trx`, crea su propia transacción (uso standalone / auditoría
 *     sin reveal, p.ej. registro de intento de acceso).
 *
 * Ref: USRH1783019898097 §4 — mecanismo de reveal transaccional.
 * Fundamentación legal: LFPDPPP art. 19 / Reglamento art. 60-61.
 */
export default class PiiAccessLogService {
  /**
   * Registra un acceso a un dato personal sensible.
   *
   * @param input — datos del acceso (quién, qué, dónde, cuándo implícito).
   * @param trx   — transacción activa del caller; si se omite se crea una propia.
   * @returns     — la fila de auditoría persistida.
   * @throws      — cualquier error de escritura se propaga sin atrapar para que
   *               el caller pueda abortar la transacción (fail-closed).
   */
  async record(input: PiiAccessInputInterface, trx?: TransactionClientContract): Promise<PiiAccessLog> {
    const executor = async (client: TransactionClientContract) => {
      const log = new PiiAccessLog()
      log.businessUnitId = input.businessUnitId
      log.accessorUserId = input.accessorUserId
      log.piiAccessLogModel = input.model
      log.piiAccessLogModelColumn = input.modelColumn
      log.piiAccessLogRecordId = input.recordId
      log.piiAccessLogAccessorIp = input.accessorIp
      log.piiAccessLogAccessorUserAgent = input.accessorUserAgent ?? null
      log.piiAccessLogRequestId = input.requestId ?? null
      log.useTransaction(client)
      await log.save()
      return log
    }

    if (trx) {
      return executor(trx)
    }

    return db.transaction(executor)
  }

  /**
   * Devuelve el historial paginado de accesos a datos sensibles filtrado por
   * el scope de unidades de negocio del usuario solicitante.
   *
   * @param filters  — filtros opcionales de búsqueda.
   * @param buScope  — lista de `businessUnitId` accesibles por el usuario.
   */
  async list(filters: PiiAccessLogsFiltersInterface, buScope: number[]) {
    const page = filters.page ?? 1
    const limit = filters.limit ?? 25

    if (buScope.length === 0) {
      return {
        meta: { total: 0, perPage: limit, currentPage: page, lastPage: 0, firstPage: 1 },
        data: [],
      }
    }

    let query = PiiAccessLog.query()
      .whereIn('business_unit_id', buScope)
      .preload('accessorUser', (q) => q.select('user_id', 'user_email'))
      .orderBy('pii_access_log_created_at', 'desc')

    if (filters.model) {
      query = query.where('pii_access_log_model', filters.model)
    }
    if (filters.column) {
      query = query.where('pii_access_log_model_column', filters.column)
    }
    if (filters.recordId) {
      query = query.where('pii_access_log_record_id', filters.recordId)
    }
    if (filters.accessorUserId) {
      query = query.where('user_id', filters.accessorUserId)
    }
    if (filters.dateFrom) {
      query = query.where('pii_access_log_created_at', '>=', filters.dateFrom)
    }
    if (filters.dateTo) {
      query = query.where('pii_access_log_created_at', '<=', filters.dateTo)
    }

    const paginator = await query.paginate(page, limit)
    const serialized = paginator.serialize()

    return {
      meta: { ...serialized.meta, page: serialized.meta.currentPage },
      data: serialized.data,
    }
  }
}
