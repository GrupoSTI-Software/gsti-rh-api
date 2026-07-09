import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import PiiAccessLog from '#models/pii_access_log'
import PiiAccessLogSubject from '#models/pii_access_log_subject'
import {
  isSensitiveExportMotive,
  SENSITIVE_EXPORT_MOTIVE_REQUIRES_NOTE,
} from '#constants/sensitive_export_motives'
import { PII_EXPORT_ERROR_CODES } from '#constants/pii_export_error_codes'
import { PiiExportAuditError } from '../exceptions/pii_export_audit_error.js'
import type { PiiAccessInputInterface } from '../interfaces/pii_access_input_interface.js'
import type { PiiAccessLogsFiltersInterface } from '../interfaces/pii_access_logs_filters_interface.js'
import type { PiiExportAuditInputInterface } from '../interfaces/pii_export_audit_input_interface.js'
import type { SensitiveExportMotive } from '../constants/sensitive_export_motives.js'

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
 * **Patrón de uso (E5 — export con datos completos):**
 * ```typescript
 * const fileBuffer = await db.transaction(async (trx) => {
 *   await piiAccessLogService.appendExportAudit(auditInput, trx)  // ← asiento primero
 *   return buildExportBuffer(rows)                                  // ← archivo después
 * })
 * // Si el asiento falla → rollback → el archivo NUNCA sale.
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
   * Valida motivo y nota de una exportación sensible antes de generar el archivo.
   *
   * @throws PiiExportAuditError 422 SEC.EXP.VAL.001 / SEC.EXP.VAL.002
   */
  validateExportMotive(motive: string | undefined, note?: string | null): SensitiveExportMotive {
    const normalizedMotive = motive?.trim()
    if (!normalizedMotive || !isSensitiveExportMotive(normalizedMotive)) {
      throw new PiiExportAuditError(
        'El motivo de exportación es obligatorio y debe pertenecer al catálogo.',
        PII_EXPORT_ERROR_CODES.MOTIVE_REQUIRED,
        422,
        'motivo-export-requerido'
      )
    }

    if (normalizedMotive === SENSITIVE_EXPORT_MOTIVE_REQUIRES_NOTE) {
      const normalizedNote = note?.trim()
      if (!normalizedNote) {
        throw new PiiExportAuditError(
          'La nota es obligatoria cuando el motivo es "otro".',
          PII_EXPORT_ERROR_CODES.NOTE_REQUIRED,
          422,
          'nota-motivo-requerida'
        )
      }
    }

    return normalizedMotive
  }

  /**
   * Registra un asiento agrupado de exportación masiva con sus titulares.
   *
   * Operación fail-closed: debe ejecutarse en la misma transacción que la
   * generación del archivo. Si la escritura del asiento o de la tabla hija
   * falla, la excepción revierte la transacción del caller.
   *
   * @param input — alcance del export (export, columnas, titulares, filtros, motivo).
   * @param trx   — transacción activa del caller; recomendado siempre en exports.
   * @returns     — asiento persistido con relación `subjects` precargada.
   * @throws PiiExportAuditError — validación de motivo/nota o falla al persistir.
   */
  async appendExportAudit(
    input: PiiExportAuditInputInterface,
    trx?: TransactionClientContract
  ): Promise<PiiAccessLog> {
    const motive = this.validateExportMotive(input.motive, input.note)
    this.assertExportAuditInput(input, motive)

    const uniqueEmployeeIds = this.normalizeEmployeeIds(input.employeeIds)
    const normalizedNote =
      motive === SENSITIVE_EXPORT_MOTIVE_REQUIRES_NOTE ? input.note!.trim() : input.note?.trim() || null

    const executor = async (client: TransactionClientContract) => {
      const log = new PiiAccessLog()
      log.businessUnitId = input.businessUnitId
      log.accessorUserId = input.accessorUserId
      log.piiAccessLogModel = null
      log.piiAccessLogModelColumn = null
      log.piiAccessLogRecordId = null
      log.piiAccessLogAccessorIp = input.accessorIp
      log.piiAccessLogAccessorUserAgent = input.accessorUserAgent ?? null
      log.piiAccessLogRequestId = input.requestId ?? null
      log.piiAccessLogExportKey = input.exportKey.trim()
      log.piiAccessLogColumns = input.sensitiveColumns
      log.piiAccessLogSubjectCount = uniqueEmployeeIds.length
      log.piiAccessLogFilters = input.filters
      log.piiAccessLogMotive = motive
      log.piiAccessLogNote = normalizedNote
      log.piiAccessLogOriginModule = input.originModule?.trim() || null
      log.useTransaction(client)

      try {
        await log.save()
      } catch {
        throw new PiiExportAuditError(
          'No se pudo registrar la exportación en la bitácora.',
          PII_EXPORT_ERROR_CODES.AUDIT_FAILED,
          500,
          'no-se-pudo-registrar-la-exportacion'
        )
      }

      if (uniqueEmployeeIds.length > 0) {
        try {
          await PiiAccessLogSubject.createMany(
            uniqueEmployeeIds.map((employeeId) => ({
              piiAccessLogId: log.piiAccessLogId,
              employeeId,
            })),
            { client }
          )
        } catch {
          throw new PiiExportAuditError(
            'No se pudo registrar la exportación en la bitácora.',
            PII_EXPORT_ERROR_CODES.AUDIT_FAILED,
            500,
            'no-se-pudo-registrar-la-exportacion'
          )
        }
      }

      await log.load('subjects')
      return log
    }

    if (trx) {
      return executor(trx)
    }

    return db.transaction(executor)
  }

  private assertExportAuditInput(
    input: PiiExportAuditInputInterface,
    motive: SensitiveExportMotive
  ): void {
    if (!input.exportKey?.trim()) {
      throw new PiiExportAuditError(
        'El identificador de exportación es obligatorio.',
        PII_EXPORT_ERROR_CODES.MOTIVE_REQUIRED,
        422,
        'motivo-export-requerido'
      )
    }

    if (!Array.isArray(input.sensitiveColumns) || input.sensitiveColumns.length === 0) {
      throw new PiiExportAuditError(
        'La exportación debe declarar al menos un campo sensible.',
        PII_EXPORT_ERROR_CODES.MOTIVE_REQUIRED,
        422,
        'motivo-export-requerido'
      )
    }

    if (!Number.isInteger(input.businessUnitId) || input.businessUnitId <= 0) {
      throw new PiiExportAuditError(
        'La unidad de negocio del asiento es inválida.',
        PII_EXPORT_ERROR_CODES.AUDIT_FAILED,
        500,
        'no-se-pudo-registrar-la-exportacion'
      )
    }

    if (!Number.isInteger(input.accessorUserId) || input.accessorUserId <= 0) {
      throw new PiiExportAuditError(
        'El usuario del asiento es inválido.',
        PII_EXPORT_ERROR_CODES.AUDIT_FAILED,
        500,
        'no-se-pudo-registrar-la-exportacion'
      )
    }

    if (!input.accessorIp?.trim()) {
      throw new PiiExportAuditError(
        'La dirección IP del asiento es obligatoria.',
        PII_EXPORT_ERROR_CODES.AUDIT_FAILED,
        500,
        'no-se-pudo-registrar-la-exportacion'
      )
    }

    if (motive === SENSITIVE_EXPORT_MOTIVE_REQUIRES_NOTE && !input.note?.trim()) {
      throw new PiiExportAuditError(
        'La nota es obligatoria cuando el motivo es "otro".',
        PII_EXPORT_ERROR_CODES.NOTE_REQUIRED,
        422,
        'nota-motivo-requerida'
      )
    }
  }

  private normalizeEmployeeIds(employeeIds: number[]): number[] {
    const unique = new Set<number>()
    for (const rawId of employeeIds) {
      const id = Number(rawId)
      if (Number.isInteger(id) && id > 0) {
        unique.add(id)
      }
    }
    return [...unique]
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
