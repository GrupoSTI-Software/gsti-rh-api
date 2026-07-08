import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import PiiAccessLog from '#models/pii_access_log'
import PiiAccessLogSubject from '#models/pii_access_log_subject'
import Employee from '#models/employee'
import {
  isSensitiveExportMotive,
  SENSITIVE_EXPORT_MOTIVE_REQUIRES_NOTE,
} from '#constants/sensitive_export_motives'
import { PII_EXPORT_ERROR_CODES } from '#constants/pii_export_error_codes'
import {
  PII_ACCESS_LOG_DEFAULT_RANGE_DAYS,
  PII_AUDIT_ERROR_CODES,
} from '#constants/pii_audit_error_codes'
import { SENSITIVE_FIELDS } from '#constants/sensitive_fields'
import { PiiExportAuditError } from '../exceptions/pii_export_audit_error.js'
import { PiiAuditError } from '../exceptions/pii_audit_error.js'
import type { PiiAccessInputInterface } from '../interfaces/pii_access_input_interface.js'
import type { PiiAccessLogsFiltersInterface } from '../interfaces/pii_access_logs_filters_interface.js'
import type { PiiExportAuditInputInterface } from '../interfaces/pii_export_audit_input_interface.js'
import type { SensitiveExportMotive } from '../constants/sensitive_export_motives.js'
import type {
  PiiAccessLogExportDetailInterface,
  PiiAccessLogFieldRefInterface,
  PiiAccessLogListResultInterface,
  PiiAccessLogListRowInterface,
  PiiAccessLogSubjectRefInterface,
} from '../interfaces/pii_access_log_list_row_interface.js'

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
   * Incluye revelados individuales y exportaciones masivas. Si no se envían
   * fechas, aplica un rango por defecto de los últimos 30 días.
   *
   * @param filters  — filtros opcionales de búsqueda.
   * @param buScope  — lista de `businessUnitId` accesibles por el usuario.
   * @throws PiiAuditError — rango de fechas inválido (`SEC.AUD.VAL.DATE.001`).
   */
  async list(filters: PiiAccessLogsFiltersInterface, buScope: number[]): Promise<PiiAccessLogListResultInterface> {
    const page = filters.page ?? 1
    const limit = filters.limit ?? 25
    const { dateFrom, dateTo, dateFromIso, dateToIso } = this.resolveDateRange(filters)

    if (buScope.length === 0) {
      return {
        meta: {
          total: 0,
          perPage: limit,
          currentPage: page,
          lastPage: 0,
          firstPage: 1,
          page,
          dateFrom: dateFromIso,
          dateTo: dateToIso,
        },
        data: [],
      }
    }

    let query = PiiAccessLog.query()
      .whereIn('business_unit_id', buScope)
      .whereNull('pii_access_log_deleted_at')
      .preload('accessorUser', (q) => {
        q.select('user_id', 'user_email', 'person_id').preload('person', (personQuery) => {
          personQuery.select(
            'person_id',
            'person_firstname',
            'person_lastname',
            'person_second_lastname'
          )
        })
      })
      .preload('subjects', (subjectsQuery) => {
        subjectsQuery
          .whereNull('pii_access_log_subject_deleted_at')
          .preload('employee', (employeeQuery) => {
            employeeQuery.select(
              'employee_id',
              'employee_first_name',
              'employee_last_name',
              'employee_second_last_name'
            )
          })
      })
      .where('pii_access_log_created_at', '>=', dateFrom)
      .where('pii_access_log_created_at', '<=', dateTo)
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
    if (filters.employeeId) {
      this.applyEmployeeFilter(query, filters.employeeId)
    }

    const paginator = await query.paginate(page, limit)
    const rows = paginator.all()
    const revealSubjects = await this.loadRevealSubjects(rows)
    const data = rows.map((row) => this.serializeListRow(row, revealSubjects))

    const serialized = paginator.serialize()

    return {
      meta: {
        ...serialized.meta,
        page: serialized.meta.currentPage,
        dateFrom: dateFromIso,
        dateTo: dateToIso,
      },
      data,
    }
  }

  private resolveDateRange(filters: PiiAccessLogsFiltersInterface): {
    dateFrom: Date
    dateTo: Date
    dateFromIso: string
    dateToIso: string
  } {
    const hasFrom = Boolean(filters.dateFrom)
    const hasTo = Boolean(filters.dateTo)

    let dateFromDt: DateTime
    let dateToDt: DateTime

    if (!hasFrom && !hasTo) {
      dateToDt = DateTime.now().endOf('day')
      dateFromDt = dateToDt.minus({ days: PII_ACCESS_LOG_DEFAULT_RANGE_DAYS }).startOf('day')
    } else {
      dateToDt = hasTo
        ? DateTime.fromJSDate(filters.dateTo!).endOf('day')
        : DateTime.now().endOf('day')
      dateFromDt = hasFrom
        ? DateTime.fromJSDate(filters.dateFrom!).startOf('day')
        : dateToDt.minus({ days: PII_ACCESS_LOG_DEFAULT_RANGE_DAYS }).startOf('day')
    }

    if (dateFromDt > dateToDt) {
      throw new PiiAuditError(
        'El rango de fechas es inválido: la fecha inicial no puede ser posterior a la final.',
        PII_AUDIT_ERROR_CODES.VAL_DATE_RANGE,
        422,
        'rango-fechas-invalido'
      )
    }

    return {
      dateFrom: dateFromDt.toJSDate(),
      dateTo: dateToDt.toJSDate(),
      dateFromIso: dateFromDt.toISODate() ?? '',
      dateToIso: dateToDt.toISODate() ?? '',
    }
  }

  private applyEmployeeFilter(
    query: ReturnType<typeof PiiAccessLog.query>,
    employeeId: number
  ): void {
    query.where((outer) => {
      outer
        .where((exportCase) => {
          exportCase
            .whereNotNull('pii_access_log_export_key')
            .whereExists((subquery) => {
              subquery
                .from('pii_access_log_subjects')
                .whereRaw('pii_access_log_subjects.pii_access_log_id = pii_access_logs.pii_access_log_id')
                .where('pii_access_log_subjects.employee_id', employeeId)
                .whereNull('pii_access_log_subjects.pii_access_log_subject_deleted_at')
            })
        })
        .orWhere((revealCase) => {
          revealCase.whereNull('pii_access_log_export_key').where((modelMatch) => {
            modelMatch
              .where((personCase) => {
                personCase
                  .where('pii_access_log_model', 'Person')
                  .whereExists((subquery) => {
                    subquery
                      .from('people')
                      .join('employees', 'employees.person_id', 'people.person_id')
                      .whereRaw('people.person_id = pii_access_logs.pii_access_log_record_id')
                      .where('employees.employee_id', employeeId)
                      .whereNull('people.person_deleted_at')
                      .whereNull('employees.employee_deleted_at')
                  })
              })
              .orWhere((bankCase) => {
                bankCase
                  .where('pii_access_log_model', 'EmployeeBank')
                  .whereExists((subquery) => {
                    subquery
                      .from('employee_banks')
                      .whereRaw(
                        'employee_banks.employee_bank_id = pii_access_logs.pii_access_log_record_id'
                      )
                      .where('employee_banks.employee_id', employeeId)
                      .whereNull('employee_banks.employee_bank_deleted_at')
                  })
              })
              .orWhere((conditionCase) => {
                conditionCase
                  .where('pii_access_log_model', 'EmployeeMedicalCondition')
                  .whereExists((subquery) => {
                    subquery
                      .from('employee_medical_conditions')
                      .whereRaw(
                        'employee_medical_conditions.employee_medical_condition_id = pii_access_logs.pii_access_log_record_id'
                      )
                      .where('employee_medical_conditions.employee_id', employeeId)
                      .whereNull('employee_medical_conditions.employee_medical_condition_deleted_at')
                  })
              })
          })
        })
    })
  }

  private async loadRevealSubjects(
    rows: PiiAccessLog[]
  ): Promise<Map<number, PiiAccessLogSubjectRefInterface>> {
    const revealRows = rows.filter(
      (row) => !row.piiAccessLogExportKey && row.piiAccessLogModel && row.piiAccessLogRecordId
    )
    const result = new Map<number, PiiAccessLogSubjectRefInterface>()
    if (revealRows.length === 0) return result

    const personRecordIds = revealRows
      .filter((row) => row.piiAccessLogModel === 'Person')
      .map((row) => row.piiAccessLogRecordId!)
    const bankRecordIds = revealRows
      .filter((row) => row.piiAccessLogModel === 'EmployeeBank')
      .map((row) => row.piiAccessLogRecordId!)
    const conditionRecordIds = revealRows
      .filter((row) => row.piiAccessLogModel === 'EmployeeMedicalCondition')
      .map((row) => row.piiAccessLogRecordId!)

    const employeeByPersonId = new Map<number, Employee>()
    const employeeByBankId = new Map<number, PiiAccessLogSubjectRefInterface>()
    const employeeByConditionId = new Map<number, PiiAccessLogSubjectRefInterface>()

    if (personRecordIds.length > 0) {
      const employees = await Employee.query()
        .whereIn('personId', personRecordIds)
        .whereNull('employee_deleted_at')
        .select(
          'employeeId',
          'personId',
          'employeeFirstName',
          'employeeLastName',
          'employeeSecondLastName'
        )

      for (const employee of employees) {
        if (employee.personId) {
          employeeByPersonId.set(employee.personId, employee)
        }
      }
    }

    if (bankRecordIds.length > 0) {
      const bankRows = await db
        .from('employee_banks')
        .join('employees', 'employees.employee_id', 'employee_banks.employee_id')
        .whereIn('employee_banks.employee_bank_id', bankRecordIds)
        .whereNull('employee_banks.employee_bank_deleted_at')
        .whereNull('employees.employee_deleted_at')
        .select(
          'employee_banks.employee_bank_id as recordId',
          'employees.employee_id as employeeId',
          'employees.employee_first_name as employeeFirstName',
          'employees.employee_last_name as employeeLastName',
          'employees.employee_second_last_name as employeeSecondLastName'
        )

      for (const row of bankRows) {
        employeeByBankId.set(Number(row.recordId), {
          employeeId: Number(row.employeeId),
          displayName: this.formatEmployeeDisplayName({
            employeeFirstName: String(row.employeeFirstName ?? ''),
            employeeLastName: String(row.employeeLastName ?? ''),
            employeeSecondLastName: String(row.employeeSecondLastName ?? ''),
          }),
        })
      }
    }

    if (conditionRecordIds.length > 0) {
      const conditionRows = await db
        .from('employee_medical_conditions')
        .join('employees', 'employees.employee_id', 'employee_medical_conditions.employee_id')
        .whereIn('employee_medical_conditions.employee_medical_condition_id', conditionRecordIds)
        .whereNull('employee_medical_conditions.employee_medical_condition_deleted_at')
        .whereNull('employees.employee_deleted_at')
        .select(
          'employee_medical_conditions.employee_medical_condition_id as recordId',
          'employees.employee_id as employeeId',
          'employees.employee_first_name as employeeFirstName',
          'employees.employee_last_name as employeeLastName',
          'employees.employee_second_last_name as employeeSecondLastName'
        )

      for (const row of conditionRows) {
        employeeByConditionId.set(Number(row.recordId), {
          employeeId: Number(row.employeeId),
          displayName: this.formatEmployeeDisplayName({
            employeeFirstName: String(row.employeeFirstName ?? ''),
            employeeLastName: String(row.employeeLastName ?? ''),
            employeeSecondLastName: String(row.employeeSecondLastName ?? ''),
          }),
        })
      }
    }

    for (const row of revealRows) {
      let subject: PiiAccessLogSubjectRefInterface | undefined

      if (row.piiAccessLogModel === 'Person') {
        const employee = employeeByPersonId.get(row.piiAccessLogRecordId!)
        if (employee) {
          subject = {
            employeeId: employee.employeeId,
            displayName: this.formatEmployeeDisplayName(employee),
          }
        }
      } else if (row.piiAccessLogModel === 'EmployeeBank') {
        subject = employeeByBankId.get(row.piiAccessLogRecordId!)
      } else if (row.piiAccessLogModel === 'EmployeeMedicalCondition') {
        subject = employeeByConditionId.get(row.piiAccessLogRecordId!)
      }

      if (!subject) continue

      result.set(row.piiAccessLogId, subject)
    }

    return result
  }

  private serializeListRow(
    row: PiiAccessLog,
    revealSubjects: Map<number, PiiAccessLogSubjectRefInterface>
  ): PiiAccessLogListRowInterface {
    const entryType = row.piiAccessLogExportKey ? 'export' : 'reveal'
    const accessorDisplayName = this.formatAccessorDisplayName(row)

    const base: PiiAccessLogListRowInterface = {
      piiAccessLogId: row.piiAccessLogId,
      entryType,
      accessedAt: row.piiAccessLogCreatedAt.toISO() ?? '',
      accessorUserId: row.accessorUserId,
      accessorDisplayName,
      originModule: row.piiAccessLogOriginModule,
      accessorIp: row.piiAccessLogAccessorIp,
      businessUnitId: row.businessUnitId,
    }

    if (entryType === 'export') {
      base.export = this.serializeExportDetail(row)
      return base
    }

    if (row.piiAccessLogModel && row.piiAccessLogModelColumn) {
      base.field = this.buildFieldRef(row.piiAccessLogModel, row.piiAccessLogModelColumn)
    }

    const subject = revealSubjects.get(row.piiAccessLogId)
    if (subject) {
      base.subject = subject
    }

    return base
  }

  private serializeExportDetail(row: PiiAccessLog): PiiAccessLogExportDetailInterface {
    const columns = (row.piiAccessLogColumns ?? []).map((columnRef) =>
      this.buildFieldRef(columnRef.model, columnRef.column)
    )

    const subjects = (row.subjects ?? [])
      .map((subjectRow) => {
        const employee = subjectRow.employee
        if (!employee) return null

        return {
          employeeId: employee.employeeId,
          displayName: this.formatEmployeeDisplayName(employee),
        }
      })
      .filter((subject): subject is PiiAccessLogSubjectRefInterface => subject !== null)

    return {
      exportKey: row.piiAccessLogExportKey ?? '',
      motive: row.piiAccessLogMotive ?? '',
      note: row.piiAccessLogNote,
      subjectCount: row.piiAccessLogSubjectCount ?? subjects.length,
      columns,
      filters: row.piiAccessLogFilters,
      subjects,
    }
  }

  private buildFieldRef(model: string, column: string): PiiAccessLogFieldRefInterface {
    const catalogField = SENSITIVE_FIELDS.find((field) => field.model === model && field.column === column)

    return {
      model,
      column,
      legalCategory: catalogField?.legalCategory ?? null,
    }
  }

  private formatAccessorDisplayName(row: PiiAccessLog): string {
    const person = row.accessorUser?.person
    if (person) {
      const fullName = [person.personFirstname, person.personLastname, person.personSecondLastname]
        .filter((part) => Boolean(part && String(part).trim()))
        .join(' ')
        .trim()
      if (fullName) return fullName
    }

    return row.accessorUser?.userEmail ?? `Usuario #${row.accessorUserId}`
  }

  private formatEmployeeDisplayName(
    employee: Pick<Employee, 'employeeFirstName' | 'employeeLastName' | 'employeeSecondLastName'> | {
      employeeFirstName?: string
      employeeLastName?: string
      employeeSecondLastName?: string
    }
  ): string {
    return [employee.employeeFirstName, employee.employeeLastName, employee.employeeSecondLastName]
      .filter((part) => Boolean(part && String(part).trim()))
      .join(' ')
      .trim()
  }
}
