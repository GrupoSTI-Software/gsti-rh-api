import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { I18n } from '@adonisjs/i18n'
import i18nManager from '@adonisjs/i18n/services/main'
import EmployeeLactationPeriod from '#models/employee_lactation_period'
import ShiftException from '#models/shift_exception'
import EmployeeLactationPeriodService from './employee_lactation_period_service.js'
import ShiftExceptionService from './shift_exception_service.js'
import { ELP_ERROR_CODES } from '../constants/employee_lactation_period_error_codes.js'
import { EmployeeLactationPeriodError } from '../exceptions/employee_lactation_period_error.js'

/**
 * Cap superior de captura aceptado para el rango total del periodo (en
 * meses). Reproducción local del valor que `EmployeeLactationPeriodService`
 * usa para `assertWithinReasonableRange`; se mantiene aquí porque el
 * cálculo de "¿la reasignación cabe sin pasarse?" se hace en este
 * servicio para reportar el error específico
 * `REASSIGN_EXCEEDS_MAX_RANGE` sin reusar la validación general (que
 * reporta `RANGE_UNREASONABLE` y es semánticamente otra cosa).
 */
const MAX_LACTATION_RANGE_MONTHS = 24

/**
 * Resultado de listar los conflictos de un periodo. Sirve directo como
 * payload del endpoint GET `/api/employee-lactation-periods/:id/conflicts`
 * (envuelto por `StandardResponseFormatter`).
 */
export interface LactationConflictListItem {
  lactationPeriodId: number
  employeeId: number
  conflictDate: string
  lactationShiftExceptionId: number
  conflictType: 'vacation' | 'work_disability' | 'maternity' | 'rest_or_permission' | 'holiday'
  conflictSlug: string
  conflictShiftExceptionId: number | null
}

export interface LactationConflictRevokeResult {
  lactationPeriodId: number
  revokedDate: string
  lactationShiftExceptionId: number
  reason: string
}

export interface LactationConflictReassignResult {
  lactationPeriodId: number
  originalDate: string
  reassignedToDate: string
  newEndDate: string
  newLactationShiftExceptionId: number
}

/**
 * Item del listado GLOBAL de conflictos a nivel empresa. Agrupa los
 * conflictos por periodo de lactancia con la información mínima
 * necesaria para que la pantalla de RH pueda mostrar tarjetas con la
 * empleada, su BU y el conteo de conflictos.
 *
 * Las propias instancias de `LactationConflictListItem` se exponen en
 * `conflicts` para que el cliente pueda renderizar el detalle inline o
 * delegar al sub-drawer existente.
 */
export interface LactationConflictGroupItem {
  lactationPeriodId: number
  employeeId: number
  employeeFirstName: string
  employeeLastName: string
  employeeCode: string | null
  businessUnitId: number
  businessUnitName: string
  lactationPeriodStartDate: string
  lactationPeriodEndDate: string
  conflictsCount: number
  conflicts: LactationConflictListItem[]
}

export interface LactationConflictListGlobalFilters {
  page: number
  limit: number
  businessUnitId?: number
  employeeId?: number
  conflictType?:
    | 'vacation'
    | 'work_disability'
    | 'maternity'
    | 'rest_or_permission'
    | 'holiday'
  from?: DateTime | null
  to?: DateTime | null
}

export interface LactationConflictBulkReassignFailure {
  shiftExceptionId: number
  errorCode: string
  errorKey: string | null
  message: string
}

export interface LactationConflictBulkReassignResult {
  lactationPeriodId: number
  totalRequested: number
  successCount: number
  reassignments: LactationConflictReassignResult[]
  failures: LactationConflictBulkReassignFailure[]
  newEndDate: string
}

/**
 * Servicio de orquestación de la HU "Gestión de conflictos del periodo
 * de lactancia". Valida pertenencia tenant del periodo y de la fila de
 * lactancia, delega el trabajo pesado a `ShiftExceptionService` (que ya
 * concentra las reglas de detección, soft-delete con auditoría y
 * cálculo del siguiente día disponible) y, en el flujo de reasignación,
 * extiende el `end_date` del propio periodo de forma transaccional.
 *
 * El servicio NO toca los flujos de creación de causas bloqueantes
 * (vacaciones, incapacidades, permisos): la corrección es siempre
 * iniciada manualmente por RH desde el módulo de lactancia, lo cual
 * mantiene el alcance acotado y auditable (LFT 170 / NOM-037).
 */
export default class EmployeeLactationPeriodConflictService {
  private i18n: I18n

  constructor(i18n?: I18n) {
    this.i18n = i18n ?? i18nManager.locale(i18nManager.defaultLocale)
  }

  private buildLactationService(): EmployeeLactationPeriodService {
    return new EmployeeLactationPeriodService(this.i18n)
  }

  private buildShiftExceptionService(): ShiftExceptionService {
    return new ShiftExceptionService(this.i18n)
  }

  /**
   * Lista los conflictos detectados en un periodo. Sin paginación: el
   * conjunto por periodo está acotado por el rango (máx. 24 meses) y en
   * la práctica son pocos días. Si en el futuro un periodo llegara a
   * tener miles de conflictos podemos paginarlo, pero sería atípico
   * (implicaría una mala configuración de calendario).
   */
  async list(
    periodId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<{
    lactationPeriodId: number
    employeeId: number
    conflictsCount: number
    conflicts: LactationConflictListItem[]
  }> {
    const period = await this.buildLactationService().ensurePeriodAccessible(
      periodId,
      allowedBusinessUnitIds
    )

    const raw = await this.buildShiftExceptionService().listLactationConflicts(period)

    const conflicts: LactationConflictListItem[] = raw.map((r) => ({
      lactationPeriodId: period.employeeLactationPeriodId,
      employeeId: period.employeeId,
      conflictDate: r.conflictDate,
      lactationShiftExceptionId: r.lactationShiftExceptionId,
      conflictType: r.conflictType,
      conflictSlug: r.conflictSlug,
      conflictShiftExceptionId: r.conflictShiftExceptionId,
    }))

    return {
      lactationPeriodId: period.employeeLactationPeriodId,
      employeeId: period.employeeId,
      conflictsCount: conflicts.length,
      conflicts,
    }
  }

  /**
   * Revoca (soft-delete) la fila de lactancia del día en conflicto. La
   * razón se clasifica automáticamente a partir del tipo de conflicto
   * actual (`vacation_conflict`, `work_disability_conflict`,
   * `maternity_conflict`, `rest_or_permission_conflict`, `holiday_conflict`).
   * Si el caller no quiere revocar por conflicto sino "manualmente",
   * pasa `manualOverride = true` y se persiste `manual_revoke`.
   */
  async revoke(
    periodId: number,
    shiftExceptionId: number,
    allowedBusinessUnitIds: number[] = [],
    manualOverride: boolean = false
  ): Promise<LactationConflictRevokeResult> {
    const period = await this.buildLactationService().ensurePeriodAccessible(
      periodId,
      allowedBusinessUnitIds
    )

    const shiftExceptionService = this.buildShiftExceptionService()

    // Localizar el conflicto exacto en la lista actualizada para
    // garantizar que (a) la fila existe, (b) pertenece al periodo y
    // (c) sigue siendo un conflicto. Esto bloquea race conditions:
    // si la causa bloqueante fue borrada entre la lectura y la acción,
    // el conflicto ya no aplica y respondemos 404.
    const conflicts = await shiftExceptionService.listLactationConflicts(period)
    const target = conflicts.find((c) => c.lactationShiftExceptionId === shiftExceptionId)
    if (!target) {
      throw new EmployeeLactationPeriodError(
        'El conflicto de lactancia indicado no existe o ya fue resuelto.',
        ELP_ERROR_CODES.CONFLICT_NOT_FOUND,
        404,
        'lactation-conflict-not-found'
      )
    }

    const reason = manualOverride
      ? 'manual_revoke'
      : this.resolveReasonFromConflictType(target.conflictType)

    const revokedRow = await db.transaction(async (trx) => {
      return shiftExceptionService.revokeLactationShiftException(
        shiftExceptionId,
        reason,
        trx
      )
    })

    if (!revokedRow) {
      // No esperado: la fila desapareció entre el list y el update.
      throw new EmployeeLactationPeriodError(
        'El conflicto de lactancia indicado no existe o ya fue resuelto.',
        ELP_ERROR_CODES.CONFLICT_NOT_FOUND,
        404,
        'lactation-conflict-not-found'
      )
    }

    return {
      lactationPeriodId: period.employeeLactationPeriodId,
      revokedDate: target.conflictDate,
      lactationShiftExceptionId: shiftExceptionId,
      reason,
    }
  }

  /**
   * Reasigna un día de lactancia revocado por conflicto al PRIMER día
   * disponible inmediatamente posterior al `end_date` actual del periodo.
   *
   * Pasos atómicos (una sola transacción):
   *   1. Validar que el conflicto siga existiendo (mismo guard que `revoke`).
   *   2. Calcular el siguiente día disponible vía
   *      `findNextAvailableLactationDate`.
   *   3. Validar que la nueva fecha no exceda `MAX_LACTATION_RANGE_MONTHS`.
   *   4. Soft-delete de la fila original con reason `reassigned`.
   *   5. Crear la nueva fila de lactancia en la nueva fecha (auditoría:
   *      `shift_exceptions_lactation_replaced_date` apunta al día revocado).
   *   6. Actualizar `employee_lactation_period_end_date` al nuevo día.
   *
   * Si cualquier paso falla, la transacción se revierte y el estado
   * queda exactamente como antes.
   */
  async reassign(
    periodId: number,
    shiftExceptionId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<LactationConflictReassignResult> {
    const period = await this.buildLactationService().ensurePeriodAccessible(
      periodId,
      allowedBusinessUnitIds
    )

    const shiftExceptionService = this.buildShiftExceptionService()

    const conflicts = await shiftExceptionService.listLactationConflicts(period)
    const target = conflicts.find((c) => c.lactationShiftExceptionId === shiftExceptionId)
    if (!target) {
      throw new EmployeeLactationPeriodError(
        'El conflicto de lactancia indicado no existe o ya fue resuelto.',
        ELP_ERROR_CODES.CONFLICT_NOT_FOUND,
        404,
        'lactation-conflict-not-found'
      )
    }

    const currentEnd = this.toDateTime(period.employeeLactationPeriodEndDate)
    const startDate = this.toDateTime(period.employeeLactationPeriodStartDate)

    const nextAvailable = await shiftExceptionService.findNextAvailableLactationDate(
      period,
      currentEnd
    )
    if (!nextAvailable) {
      throw new EmployeeLactationPeriodError(
        'No hay días disponibles para reasignar este día de lactancia dentro del horizonte de búsqueda.',
        ELP_ERROR_CODES.REASSIGN_NO_AVAILABLE_DATE,
        422,
        'lactation-reassign-no-available-date'
      )
    }

    // Validar cap de 24 meses con la NUEVA end_date. Misma fórmula que
    // `EmployeeLactationPeriodService.assertWithinReasonableRange`.
    const diffMonths = nextAvailable.diff(startDate, 'months').months
    if (diffMonths > MAX_LACTATION_RANGE_MONTHS) {
      throw new EmployeeLactationPeriodError(
        'La reasignación extendería el periodo más allá del máximo de 24 meses permitido por captura.',
        ELP_ERROR_CODES.REASSIGN_EXCEEDS_MAX_RANGE,
        422,
        'lactation-reassign-exceeds-max-range'
      )
    }

    const newEndIso = nextAvailable.toFormat('yyyy-LL-dd')
    const originalIso = target.conflictDate

    const newRow = await db.transaction(async (trx) => {
      // Paso 4: soft-delete con reason 'reassigned'.
      const revoked = await shiftExceptionService.revokeLactationShiftException(
        shiftExceptionId,
        'reassigned',
        trx
      )
      if (!revoked) {
        throw new EmployeeLactationPeriodError(
          'El conflicto de lactancia indicado no existe o ya fue resuelto.',
          ELP_ERROR_CODES.CONFLICT_NOT_FOUND,
          404,
          'lactation-conflict-not-found'
        )
      }

      // Paso 5: crear la nueva fila.
      const created = await shiftExceptionService.createReassignedLactationDay(
        period,
        nextAvailable,
        originalIso,
        trx
      )

      // Paso 6: extender end_date del periodo.
      period.useTransaction(trx)
      period.employeeLactationPeriodEndDate = nextAvailable
      await period.save()

      return created
    })

    return {
      lactationPeriodId: period.employeeLactationPeriodId,
      originalDate: originalIso,
      reassignedToDate: newEndIso,
      newEndDate: newEndIso,
      newLactationShiftExceptionId: (newRow as ShiftException).shiftExceptionId,
    }
  }

  /**
   * Listado GLOBAL de conflictos a nivel empresa, agrupado por periodo
   * de lactancia. Sirve a la pantalla de RH "Conflictos de lactancia"
   * que muestra de un vistazo todos los choques activos sin tener que
   * abrir el drawer de cada empleada.
   *
   * Algoritmo:
   *   1. Selecciona los periodos de lactancia vivos cuyo rango se
   *      cruza con los filtros (BU del scope, empleada concreta y/o
   *      ventana `from`/`to`).
   *   2. Para cada periodo, delega en `ShiftExceptionService.listLactationConflicts`
   *      (reusa la misma detección que el sub-drawer por empleado).
   *   3. Aplica el filtro `conflictType` post-detección (es más simple
   *      que inyectarlo en el SQL del SES).
   *   4. Pagina sólo los GRUPOS que tienen al menos 1 conflicto que
   *      pasó el filtro: la paginación es por periodo, no por día.
   *
   * Multitenant: `businessUnitId` debe estar contenido en
   * `allowedBusinessUnitIds`; si no, se ignora y se aplica el scope
   * completo (mismo patrón que el reporte de cumplimiento).
   */
  async listGlobal(
    filters: LactationConflictListGlobalFilters,
    allowedBusinessUnitIds: number[] = []
  ): Promise<{
    meta: {
      total: number
      perPage: number
      currentPage: number
      lastPage: number
    }
    data: LactationConflictGroupItem[]
  }> {
    const safeLimit = Math.min(Math.max(filters.limit, 1), 500)
    const safePage = Math.max(filters.page, 1)

    if (allowedBusinessUnitIds.length === 0) {
      return {
        meta: { total: 0, perPage: safeLimit, currentPage: safePage, lastPage: 1 },
        data: [],
      }
    }

    // Decide el scope de BU efectivo: si el header global filtra a una
    // BU concreta y ésta pertenece al scope del usuario, se respeta;
    // en cualquier otro caso se usa el scope completo del usuario.
    const effectiveBusinessUnitIds =
      filters.businessUnitId !== undefined &&
      allowedBusinessUnitIds.includes(filters.businessUnitId)
        ? [filters.businessUnitId]
        : allowedBusinessUnitIds

    const fromIso = filters.from?.toISODate() ?? null
    const toIso = filters.to?.toISODate() ?? null

    const periodsQuery = EmployeeLactationPeriod.query()
      .whereNull('employee_lactation_period_deleted_at')
      .whereHas('employee', (q) => {
        q.whereNull('employee_deleted_at').whereIn(
          'business_unit_id',
          effectiveBusinessUnitIds
        )
      })
      .preload('employee', (eq) => {
        eq.preload('person').preload('businessUnit')
      })
      .orderBy('employee_lactation_period_start_date', 'desc')

    if (filters.employeeId !== undefined) {
      periodsQuery.where('employee_id', filters.employeeId)
    }
    if (fromIso) {
      periodsQuery.where('employee_lactation_period_end_date', '>=', fromIso)
    }
    if (toIso) {
      periodsQuery.where('employee_lactation_period_start_date', '<=', toIso)
    }

    const periods = await periodsQuery

    const shiftExceptionService = this.buildShiftExceptionService()
    const groups: LactationConflictGroupItem[] = []

    for (const period of periods) {
      const conflictsRaw = await shiftExceptionService.listLactationConflicts(period)
      const conflicts: LactationConflictListItem[] = conflictsRaw
        .filter((c) => {
          if (filters.conflictType && c.conflictType !== filters.conflictType) {
            return false
          }
          if (fromIso && c.conflictDate < fromIso) return false
          if (toIso && c.conflictDate > toIso) return false
          return true
        })
        .map((c) => ({
          lactationPeriodId: period.employeeLactationPeriodId,
          employeeId: period.employeeId,
          conflictDate: c.conflictDate,
          lactationShiftExceptionId: c.lactationShiftExceptionId,
          conflictType: c.conflictType,
          conflictSlug: c.conflictSlug,
          conflictShiftExceptionId: c.conflictShiftExceptionId,
        }))

      if (conflicts.length === 0) continue

      groups.push({
        lactationPeriodId: period.employeeLactationPeriodId,
        employeeId: period.employeeId,
        employeeFirstName: period.employee?.person?.personFirstname ?? '',
        employeeLastName: period.employee?.person?.personLastname ?? '',
        employeeCode: this.extractEmployeeCode(period.employee),
        businessUnitId: period.employee?.businessUnitId ?? 0,
        businessUnitName: period.employee?.businessUnit?.businessUnitName ?? '',
        lactationPeriodStartDate:
          this.dateColumnToIso(period.employeeLactationPeriodStartDate) ?? '',
        lactationPeriodEndDate:
          this.dateColumnToIso(period.employeeLactationPeriodEndDate) ?? '',
        conflictsCount: conflicts.length,
        conflicts,
      })
    }

    // Paginación en memoria sobre el listado de grupos (el universo
    // máximo es el número de periodos activos en la empresa, que en la
    // práctica es pequeño; si crece, este punto se puede mover a SQL).
    const total = groups.length
    const lastPage = Math.max(Math.ceil(total / safeLimit), 1)
    const offset = (safePage - 1) * safeLimit
    const pageData = groups.slice(offset, offset + safeLimit)

    return {
      meta: { total, perPage: safeLimit, currentPage: safePage, lastPage },
      data: pageData,
    }
  }

  /**
   * Reasignación BULK de varios días de un mismo periodo en una sola
   * transacción atómica. Si cualquier reasignación falla, la
   * transacción se revierte completamente y NINGÚN día queda
   * reasignado (estado anterior intacto).
   *
   * Iteración:
   *   1. Valida pertenencia tenant del periodo.
   *   2. Recarga la lista de conflictos y verifica que TODOS los ids
   *      solicitados sigan siendo conflictos vivos.
   *   3. Por cada id, ejecuta el mismo flujo que `reassign` pero
   *      partiendo del `end_date` que se va acumulando al extender
   *      cada paso. Esto asegura que dos reasignaciones consecutivas
   *      no caigan en la misma fecha calculada.
   *   4. Si encuentra un error tipado del módulo lo coleccciona en
   *      `failures` y aborta la transacción (todo-o-nada).
   */
  async reassignBulk(
    periodId: number,
    shiftExceptionIds: number[],
    allowedBusinessUnitIds: number[] = []
  ): Promise<LactationConflictBulkReassignResult> {
    const period = await this.buildLactationService().ensurePeriodAccessible(
      periodId,
      allowedBusinessUnitIds
    )

    const shiftExceptionService = this.buildShiftExceptionService()

    // Pre-validación: todos los ids deben ser conflictos vivos del periodo.
    const conflicts = await shiftExceptionService.listLactationConflicts(period)
    const conflictById = new Map<number, (typeof conflicts)[number]>()
    for (const c of conflicts) {
      conflictById.set(c.lactationShiftExceptionId, c)
    }

    const failures: LactationConflictBulkReassignFailure[] = []
    for (const id of shiftExceptionIds) {
      if (!conflictById.has(id)) {
        failures.push({
          shiftExceptionId: id,
          errorCode: ELP_ERROR_CODES.CONFLICT_NOT_FOUND,
          errorKey: 'lactation-conflict-not-found',
          message: 'El conflicto de lactancia indicado no existe o ya fue resuelto.',
        })
      }
    }
    if (failures.length > 0) {
      // Falla rápida: si CUALQUIER id no es un conflicto válido, no
      // iniciamos transacción. Es la convención todo-o-nada del bulk.
      return {
        lactationPeriodId: period.employeeLactationPeriodId,
        totalRequested: shiftExceptionIds.length,
        successCount: 0,
        reassignments: [],
        failures,
        newEndDate: this.dateColumnToIso(period.employeeLactationPeriodEndDate) ?? '',
      }
    }

    const reassignments: LactationConflictReassignResult[] = []

    try {
      await db.transaction(async (trx) => {
        period.useTransaction(trx)
        const startDate = this.toDateTime(period.employeeLactationPeriodStartDate)

        for (const id of shiftExceptionIds) {
          const target = conflictById.get(id)!

          // Recalculamos `nextAvailableDate` partiendo del end_date
          // actual de `period`, que ya fue actualizado en pasos
          // previos del bucle (si los hubo). Esto garantiza que dos
          // reasignaciones consecutivas no caigan en la misma fecha.
          const currentEnd = this.toDateTime(period.employeeLactationPeriodEndDate)
          const nextAvailable = await shiftExceptionService.findNextAvailableLactationDate(
            period,
            currentEnd,
            trx
          )
          if (!nextAvailable) {
            throw new EmployeeLactationPeriodError(
              'No hay días disponibles para reasignar todos los días seleccionados dentro del horizonte de búsqueda.',
              ELP_ERROR_CODES.REASSIGN_NO_AVAILABLE_DATE,
              422,
              'lactation-reassign-no-available-date'
            )
          }

          const diffMonths = nextAvailable.diff(startDate, 'months').months
          if (diffMonths > MAX_LACTATION_RANGE_MONTHS) {
            throw new EmployeeLactationPeriodError(
              'La reasignación bulk extendería el periodo más allá del máximo de 24 meses permitido.',
              ELP_ERROR_CODES.REASSIGN_EXCEEDS_MAX_RANGE,
              422,
              'lactation-reassign-exceeds-max-range'
            )
          }

          const newEndIso = nextAvailable.toFormat('yyyy-LL-dd')
          const originalIso = target.conflictDate

          await shiftExceptionService.revokeLactationShiftException(
            id,
            'reassigned',
            trx
          )

          const newRow = await shiftExceptionService.createReassignedLactationDay(
            period,
            nextAvailable,
            originalIso,
            trx
          )

          period.employeeLactationPeriodEndDate = nextAvailable
          await period.save()

          reassignments.push({
            lactationPeriodId: period.employeeLactationPeriodId,
            originalDate: originalIso,
            reassignedToDate: newEndIso,
            newEndDate: newEndIso,
            newLactationShiftExceptionId: newRow.shiftExceptionId,
          })
        }
      })
    } catch (error) {
      // Propagamos errores tipados del módulo (los maneja el controller
      // con `respondError`); todo error genérico se envuelve en uno
      // tipado para mantener consistencia de respuesta.
      if (error instanceof EmployeeLactationPeriodError) {
        throw error
      }
      throw new EmployeeLactationPeriodError(
        error instanceof Error ? error.message : 'Error en la reasignación bulk.',
        ELP_ERROR_CODES.SYS_UNHANDLED,
        500
      )
    }

    return {
      lactationPeriodId: period.employeeLactationPeriodId,
      totalRequested: shiftExceptionIds.length,
      successCount: reassignments.length,
      reassignments,
      failures: [],
      newEndDate: this.dateColumnToIso(period.employeeLactationPeriodEndDate) ?? '',
    }
  }

  private extractEmployeeCode(employee: unknown): string | null {
    const e = employee as
      | { employeeCode?: string | null; employeePayrollCode?: string | number | null }
      | null
      | undefined
    if (!e) return null
    if (e.employeeCode) return String(e.employeeCode)
    if (e.employeePayrollCode !== null && e.employeePayrollCode !== undefined) {
      return String(e.employeePayrollCode)
    }
    return null
  }

  private dateColumnToIso(value: unknown): string | null {
    if (value === null || value === undefined) return null
    if (DateTime.isDateTime(value)) {
      const iso = (value as DateTime).toUTC().toISODate()
      return iso
    }
    if (value instanceof Date) {
      return DateTime.fromJSDate(value, { zone: 'utc' }).toISODate()
    }
    if (typeof value === 'string') {
      return value.length >= 10 ? value.substring(0, 10) : value
    }
    return null
  }

  private resolveReasonFromConflictType(
    conflictType:
      | 'vacation'
      | 'work_disability'
      | 'maternity'
      | 'rest_or_permission'
      | 'holiday'
  ): string {
    switch (conflictType) {
      case 'vacation':
        return 'vacation_conflict'
      case 'work_disability':
        return 'work_disability_conflict'
      case 'maternity':
        return 'maternity_conflict'
      case 'rest_or_permission':
        return 'rest_or_permission_conflict'
      case 'holiday':
        return 'holiday_conflict'
      default:
        return 'manual_revoke'
    }
  }

  /**
   * Versión local del helper `toDateTime` que usan los servicios de
   * lactancia para evitar el drift de timezone con `@column.date()`.
   * Documentado en detalle en `ShiftExceptionService.toDateTime`.
   */
  private toDateTime(value: unknown): DateTime {
    if (DateTime.isDateTime(value)) {
      const iso = (value as DateTime).toUTC().toISODate()
      if (iso) return DateTime.fromISO(iso, { zone: 'UTC-6' })
      return (value as DateTime).setZone('UTC-6')
    }
    if (value instanceof Date) {
      const iso = DateTime.fromJSDate(value, { zone: 'utc' }).toISODate()
      if (iso) return DateTime.fromISO(iso, { zone: 'UTC-6' })
      return DateTime.fromJSDate(value).setZone('UTC-6')
    }
    if (typeof value === 'string') {
      const head = value.length >= 10 ? value.substring(0, 10) : value
      const iso = DateTime.fromISO(head, { zone: 'UTC-6' })
      if (iso.isValid) return iso
      const sql = DateTime.fromSQL(value, { zone: 'UTC-6' })
      if (sql.isValid) return sql
    }
    return DateTime.invalid('Fecha no parseable para conflicto de lactancia')
  }
}
