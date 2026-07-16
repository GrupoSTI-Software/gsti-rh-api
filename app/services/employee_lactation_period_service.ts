import { DateTime } from 'luxon'
// import env from '#start/env'
import db from '@adonisjs/lucid/services/db'
import { I18n } from '@adonisjs/i18n'
import i18nManager from '@adonisjs/i18n/services/main'
import EmployeeLactationPeriod, {
  type EmployeeLactationPeriodReductionApplication,
  type EmployeeLactationPeriodType,
} from '#models/employee_lactation_period'
import Employee from '#models/employee'
import EmployeeChildren from '#models/employee_children'
// import BusinessUnit from '#models/business_unit'
import ShiftExceptionService, {
  type LactationShiftExceptionsResult,
} from './shift_exception_service.js'
import { ELP_ERROR_CODES } from '../constants/employee_lactation_period_error_codes.js'
import { EmployeeLactationPeriodError } from '../exceptions/employee_lactation_period_error.js'

const MAX_LACTATION_RANGE_MONTHS = 24

/**
 * Mínimo legal de lactancia según LFT artículo 170, fracción IV.
 * La empleada tiene derecho a "dos reposos extraordinarios por día, de
 * media hora cada uno" o equivalente, durante el periodo de lactancia
 * de seis meses como mínimo. El sistema bloquea capturas por debajo
 * de este mínimo para evitar violaciones inadvertidas al derecho.
 *
 * Tolerancia: aceptamos hasta 3 días por debajo del límite teórico
 * (≈6 meses = 182.5 días) para absorber redondeos por meses con
 * distinta cantidad de días (febrero, meses de 30 vs 31).
 */
const MIN_LACTATION_RANGE_MONTHS = 6

const DEFAULT_REDUCTION_APPLICATION: EmployeeLactationPeriodReductionApplication = 'end'

export interface EmployeeLactationPeriodCreatePayload {
  employeeId: number
  employeeLactationPeriodStartDate: string
  employeeLactationPeriodEndDate: string
  employeeLactationPeriodType: EmployeeLactationPeriodType
  employeeLactationPeriodReductionApplication?: EmployeeLactationPeriodReductionApplication
  employeeLactationPeriodNotes?: string | null
  /**
   * Vínculo OPCIONAL al hijo registrado de la empleada que justifica el
   * derecho. `null` se persiste tal cual. Si llega un id, el service
   * valida pertenencia al mismo `employeeId` y lanza 422 con key
   * `hijo-no-pertenece-al-empleado` cuando no aplica.
   */
  employeeChildrenId?: number | null
}

export type EmployeeLactationPeriodUpdatePayload = Partial<EmployeeLactationPeriodCreatePayload>

/**
 * Convierte un valor de fecha (Luxon `DateTime`, JS `Date` o string)
 * a `YYYY-MM-DD`. Devuelve `null` si el valor es nulo o no parseable.
 */
function toIsoDateString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (DateTime.isDateTime(value)) {
    return (value as DateTime).toISODate()
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate()
  }
  if (typeof value === 'string') {
    const direct = value.length >= 10 ? value.substring(0, 10) : value
    const parsed = DateTime.fromISO(value)
    return parsed.isValid ? parsed.toISODate() : direct
  }
  return null
}

/**
 * Convierte un valor de timestamp a ISO completo. Acepta `DateTime`, `Date`
 * o string ya serializado.
 */
function toIsoDateTimeString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (DateTime.isDateTime(value)) {
    return (value as DateTime).toISO()
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISO()
  }
  if (typeof value === 'string') {
    return value
  }
  return null
}

/**
 * Mini-objeto del hijo vinculado para la respuesta del CRUD. Sólo se
 * exponen los campos necesarios para pintarlo en la card del front
 * (nombre completo + cumpleaños) — NO se expone el `employeeId` ni
 * timestamps internos para reducir la superficie de datos sensibles.
 */
export interface SerializedLactationChild {
  employeeChildrenId: number
  employeeChildrenFirstname: string
  employeeChildrenLastname: string
  employeeChildrenSecondLastname: string
  employeeChildrenBirthday: string | null
}

function serializeLactationChild(
  child: EmployeeChildren | null | undefined
): SerializedLactationChild | null {
  if (!child) return null
  return {
    employeeChildrenId: child.employeeChildrenId,
    employeeChildrenFirstname: child.employeeChildrenFirstname ?? '',
    employeeChildrenLastname: child.employeeChildrenLastname ?? '',
    employeeChildrenSecondLastname: child.employeeChildrenSecondLastname ?? '',
    employeeChildrenBirthday: child.employeeChildrenBirthday
      ? toIsoDateString(child.employeeChildrenBirthday)
      : null,
  }
}

/** Estructura final que se entrega al cliente HTTP. */
function serializeLactationPeriod(period: EmployeeLactationPeriod) {
  return {
    employeeLactationPeriodId: period.employeeLactationPeriodId,
    employeeId: period.employeeId,
    employeeLactationPeriodStartDate: toIsoDateString(
      period.employeeLactationPeriodStartDate
    ),
    employeeLactationPeriodEndDate: toIsoDateString(
      period.employeeLactationPeriodEndDate
    ),
    employeeLactationPeriodType: period.employeeLactationPeriodType,
    employeeLactationPeriodReductionApplication:
      period.employeeLactationPeriodReductionApplication,
    employeeLactationPeriodNotes: period.employeeLactationPeriodNotes ?? null,
    /**
     * Se expone siempre (aun en `null`) para que el cliente pueda
     * distinguir "sin vínculo" vs "campo nunca consultado". El selector
     * del drawer se basa en este flag para preseleccionar el hijo.
     */
    employeeChildrenId: period.employeeChildrenId ?? null,
    /**
     * Objeto resumido del hijo vinculado, listo para renderizarse en la
     * card del periodo SIN tener que hacer un fetch adicional al
     * endpoint de hijos. Es `null` cuando no hay vínculo o cuando el
     * caller no precargó la relación (en cuyo caso el front degrada
     * mostrando sólo el id, sin nombre).
     */
    employeeChild: serializeLactationChild(period.employeeChild),
    employeeLactationPeriodCreatedAt: toIsoDateTimeString(
      period.employeeLactationPeriodCreatedAt
    ),
    employeeLactationPeriodUpdatedAt: toIsoDateTimeString(
      period.employeeLactationPeriodUpdatedAt
    ),
  }
}

/**
 * Servicio de dominio del catálogo de periodos de lactancia.
 *
 * - Aísla por empresa multitenant: cualquier empleada referenciada debe
 *   pertenecer a una `business_unit` activa dentro del scope central del tenant.
 *   El aislamiento se aplica en cada operación (read / write).
 * - Aplica las reglas de negocio (coherencia de fechas, sanity de 24 meses,
 *   traslape contra periodos activos del mismo empleado).
 * - Mantiene coherencia con el motor de excepciones de turno
 *   (`shift_exceptions`): toda escritura o borrado de un periodo regenera o
 *   borra las excepciones diarias correspondientes dentro de la misma
 *   transacción (si la generación falla, el periodo falla).
 */
export default class EmployeeLactationPeriodService {
  private i18n: I18n

  /**
   * `i18n` es opcional para preservar compatibilidad con los call sites que ya
   * instanciaban el service sin contexto HTTP. Si no se pasa, caemos al locale
   * por defecto del sistema vía `i18nManager` (mismo patrón usado en
   * `attendance_fault_hr_notification_service`).
   */
  constructor(i18n?: I18n) {
    this.i18n = i18n ?? i18nManager.locale(i18nManager.defaultLocale)
  }

  private buildShiftExceptionService(): ShiftExceptionService {
    return new ShiftExceptionService(this.i18n)
  }
  /**
   * Lista paginada de periodos de lactancia visibles para la empresa actual.
   * Orden: `employee_lactation_period_start_date DESC`.
   *
   * @param page Página (1-indexada).
   * @param limit Tamaño de página (máximo 500).
   * @param employeeId Filtra por empleada específica.
   */
  async listPaginated(page: number, limit: number, employeeId?: number, allowedBusinessUnitIds: number[] = []) {
    const safeLimit = Math.min(Math.max(limit, 1), 500)
    const safePage = Math.max(page, 1)

    const query = EmployeeLactationPeriod.query()
      .whereNull('employee_lactation_period_deleted_at')
      .whereHas('employee', (q) => {
        q.whereNull('employee_deleted_at')
        if (allowedBusinessUnitIds.length > 0) {
          q.whereIn('business_unit_id', allowedBusinessUnitIds)
        } else {
          // Sin BU permitidas, ningún registro debe regresar.
          q.whereRaw('1 = 0')
        }
      })
      // Trae el hijo vinculado para que la card del front pueda mostrar
      // el chip "Hijo: Nombre (yyyy-mm-dd)" sin un fetch adicional. El
      // preload es LEFT JOIN: periodos sin vínculo regresan con la
      // relación en `null` y el serializer la mapea a `employeeChild: null`.
      .preload('employeeChild')

    if (employeeId !== undefined) {
      query.where('employee_id', employeeId)
    }

    query.orderBy('employee_lactation_period_start_date', 'desc')

    const paginator = await query.paginate(safePage, safeLimit)
    // Conservamos las instancias del modelo (con DateTime de Luxon intactos)
    // y serializamos sólo la metadata para construir la respuesta.
    const meta = paginator.serialize().meta

    return {
      meta,
      data: paginator.all().map((row) => serializeLactationPeriod(row)),
    }
  }

  /**
   * Crea un periodo de lactancia para una empleada de la empresa actual.
   * Valida coherencia de fechas, sanity (≤24 meses) y traslape con periodos vivos.
   *
   * Side-effect transaccional: inmediatamente después de persistir el periodo se
   * llama a `ShiftExceptionService.generateForLactationPeriod(periodId, trx)`.
   * Si la generación falla la transacción hace rollback y el periodo no se crea
   * (excepto si la falla es por días sin shift, que se considera advertencia y
   * no detiene la creación; el método del shift devuelve `omittedDaysWithoutShift`).
   */
  async create(payload: EmployeeLactationPeriodCreatePayload, allowedBusinessUnitIds: number[] = []) {
    await this.ensureEmployeeBelongsToCompany(payload.employeeId, allowedBusinessUnitIds)

    const startDate = this.parseDate(payload.employeeLactationPeriodStartDate)
    const endDate = this.parseDate(payload.employeeLactationPeriodEndDate)

    this.assertDateCoherence(startDate, endDate)
    this.assertWithinReasonableRange(startDate, endDate)
    await this.assertNoOverlap(payload.employeeId, startDate, endDate)

    // Validamos pertenencia del hijo ANTES de abrir la transacción para
    // evitar el costo de un rollback ante un error de validación
    // trivial. `null`/`undefined` salta el check (vínculo opcional).
    if (payload.employeeChildrenId !== null && payload.employeeChildrenId !== undefined) {
      await this.assertChildBelongsToEmployee(
        payload.employeeChildrenId,
        payload.employeeId
      )
    }

    const { period, shiftExceptionsResult } = await db.transaction(async (trx) => {
      const newPeriod = new EmployeeLactationPeriod()
      newPeriod.employeeId = payload.employeeId
      newPeriod.employeeLactationPeriodStartDate = startDate
      newPeriod.employeeLactationPeriodEndDate = endDate
      newPeriod.employeeLactationPeriodType = payload.employeeLactationPeriodType
      newPeriod.employeeLactationPeriodReductionApplication =
        payload.employeeLactationPeriodReductionApplication ?? DEFAULT_REDUCTION_APPLICATION
      newPeriod.employeeLactationPeriodNotes = this.normalizeNotes(
        payload.employeeLactationPeriodNotes
      )
      newPeriod.employeeChildrenId = payload.employeeChildrenId ?? null
      newPeriod.useTransaction(trx)
      await newPeriod.save()

      // Carga la relación dentro de la misma transacción si el periodo
      // se guardó con vínculo; así la respuesta incluye el mini-objeto
      // y la card del front pinta el chip sin un round-trip extra.
      if (newPeriod.employeeChildrenId) {
        await newPeriod.useTransaction(trx).load('employeeChild')
      }

      const result = await this.buildShiftExceptionService().generateForLactationPeriod(
        newPeriod.employeeLactationPeriodId,
        trx
      )

      return { period: newPeriod, shiftExceptionsResult: result }
    })

    return {
      ...serializeLactationPeriod(period),
      shiftExceptions: shiftExceptionsResult,
    }
  }

  /**
   * Edita un periodo existente. Acepta cualquier subconjunto de campos.
   * Si se cambia `employeeId`, valida nuevamente pertenencia a la empresa.
   * Si cambian fechas, vuelve a validar coherencia, sanity y traslape.
   *
   * Side-effect transaccional: cuando cambian las fechas, el tipo o la
   * modalidad de aplicación, se llama a
   * `ShiftExceptionService.regenerateForLactationPeriod(periodId, trx)` para
   * borrar (soft-delete) las excepciones futuras y volverlas a generar. Las
   * excepciones pasadas se conservan intactas. Si sólo cambia `notes`, no se
   * regenera nada.
   */
  async update(periodId: number, payload: EmployeeLactationPeriodUpdatePayload, allowedBusinessUnitIds: number[] = []) {
    const period = await this.findPeriodInCompanyOrFail(periodId, allowedBusinessUnitIds)

    const nextEmployeeId = payload.employeeId ?? period.employeeId
    if (payload.employeeId && payload.employeeId !== period.employeeId) {
      await this.ensureEmployeeBelongsToCompany(payload.employeeId, allowedBusinessUnitIds)
    }

    const nextStartDate =
      payload.employeeLactationPeriodStartDate !== undefined
        ? this.parseDate(payload.employeeLactationPeriodStartDate)
        : period.employeeLactationPeriodStartDate

    const nextEndDate =
      payload.employeeLactationPeriodEndDate !== undefined
        ? this.parseDate(payload.employeeLactationPeriodEndDate)
        : period.employeeLactationPeriodEndDate

    const datesChanged =
      payload.employeeLactationPeriodStartDate !== undefined ||
      payload.employeeLactationPeriodEndDate !== undefined

    const employeeChanged = nextEmployeeId !== period.employeeId
    const typeChanged =
      payload.employeeLactationPeriodType !== undefined &&
      payload.employeeLactationPeriodType !== period.employeeLactationPeriodType
    const applicationChanged =
      payload.employeeLactationPeriodReductionApplication !== undefined &&
      payload.employeeLactationPeriodReductionApplication !==
        period.employeeLactationPeriodReductionApplication
    const shiftRelevantChange = datesChanged || employeeChanged || typeChanged || applicationChanged

    if (datesChanged) {
      this.assertDateCoherence(nextStartDate, nextEndDate)
      this.assertWithinReasonableRange(nextStartDate, nextEndDate)
    }

    if (datesChanged || employeeChanged) {
      await this.assertNoOverlap(
        nextEmployeeId,
        nextStartDate,
        nextEndDate,
        periodId
      )
    }

    // Validamos pertenencia del hijo si el patch lo trae con un id (no
    // si lo trae como `null`, que es la operación de desvincular). Se
    // hace ANTES de abrir la transacción por el mismo motivo que en
    // `create()`. Se valida contra el `nextEmployeeId` por si el patch
    // también cambia la empleada en la misma operación (caso raro pero
    // soportado por el endpoint).
    if (
      payload.employeeChildrenId !== undefined &&
      payload.employeeChildrenId !== null
    ) {
      await this.assertChildBelongsToEmployee(
        payload.employeeChildrenId,
        nextEmployeeId
      )
    }

    const { period: updatedPeriod, shiftExceptionsResult } = await db.transaction(
      async (trx) => {
        period.useTransaction(trx)
        period.employeeId = nextEmployeeId
        period.employeeLactationPeriodStartDate = nextStartDate
        period.employeeLactationPeriodEndDate = nextEndDate
        if (payload.employeeLactationPeriodType !== undefined) {
          period.employeeLactationPeriodType = payload.employeeLactationPeriodType
        }
        if (payload.employeeLactationPeriodReductionApplication !== undefined) {
          period.employeeLactationPeriodReductionApplication =
            payload.employeeLactationPeriodReductionApplication
        }
        if (payload.employeeLactationPeriodNotes !== undefined) {
          period.employeeLactationPeriodNotes = this.normalizeNotes(
            payload.employeeLactationPeriodNotes
          )
        }
        // Distinguir `null` (desvincular) vs `undefined` (no tocar). Si
        // el patch trae explícitamente `null`, se persiste como tal.
        if (payload.employeeChildrenId !== undefined) {
          period.employeeChildrenId = payload.employeeChildrenId
        }
        await period.save()

        let result: LactationShiftExceptionsResult | null = null
        if (shiftRelevantChange) {
          result = await this.buildShiftExceptionService().regenerateForLactationPeriod(
            period.employeeLactationPeriodId,
            trx
          )
        }
        return { period, shiftExceptionsResult: result }
      }
    )

    await updatedPeriod.refresh()
    // Tras `refresh()` se pierde cualquier relación cargada previamente.
    // Volvemos a cargarla sólo si hay vínculo; periodos sin hijo dejan
    // `employeeChild` como `null` en la respuesta.
    if (updatedPeriod.employeeChildrenId) {
      await updatedPeriod.load('employeeChild')
    }

    return {
      ...serializeLactationPeriod(updatedPeriod),
      shiftExceptions: shiftExceptionsResult,
    }
  }

  /**
   * Soft delete (Lucid + adonis-lucid-soft-deletes). Idempotente sobre la fila.
   *
   * Side-effect transaccional: antes del soft-delete del propio periodo se
   * borran (soft-delete) TODAS las excepciones diarias vinculadas vía
   * `lactation_period_id` mediante
   * `ShiftExceptionService.destroyForLactationPeriod(periodId, trx)`.
   */
  async destroy(periodId: number, allowedBusinessUnitIds: number[] = []) {
    const period = await this.findPeriodInCompanyOrFail(periodId, allowedBusinessUnitIds)

    const { deletedCount } = await db.transaction(async (trx) => {
      const result = await this.buildShiftExceptionService().destroyForLactationPeriod(
        periodId,
        trx
      )
      period.useTransaction(trx)
      await period.delete()
      return result
    })

    return {
      ...serializeLactationPeriod(period),
      shiftExceptions: {
        lactationPeriodId: periodId,
        deletedCount,
      },
    }
  }

  /**
   * Endpoint manual de regeneración. Útil cuando el admin asigna un shift a la
   * empleada DESPUÉS de haber creado el periodo, cuando se sospecha de
   * desincronización entre el periodo y sus excepciones, o cuando se necesita
   * reparar excepciones generadas con un bug previo.
   *
   * Borra TODAS las excepciones vinculadas al periodo (pasadas y futuras) y
   * las regenera para el rango completo, leyendo el shift vigente para cada
   * día. Si la empleada no tiene NINGÚN `EmployeeShift` activo en todo el rango
   * lanza 422 `NO_ACTIVE_SHIFT`.
   */
  async regenerateShiftExceptions(
    periodId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<{
    lactationPeriodId: number
    regeneratedExceptionsCount: number
    omittedDaysWithoutShift: string[]
    skippedDaysWithConflict: string[]
  }> {
    const period = await this.findPeriodInCompanyOrFail(periodId, allowedBusinessUnitIds)

    const result = await db.transaction(async (trx) => {
      return this.buildShiftExceptionService().regenerateAllForLactationPeriod(
        period.employeeLactationPeriodId,
        trx
      )
    })

    const totalDaysInRange = this.countDaysInRange(
      this.toDateTime(period.employeeLactationPeriodStartDate),
      this.toDateTime(period.employeeLactationPeriodEndDate)
    )
    if (
      result.generatedCount === 0 &&
      result.omittedDaysWithoutShift.length >= Math.max(totalDaysInRange, 1)
    ) {
      throw new EmployeeLactationPeriodError(
        'La empleada no tiene un turno activo en el rango del periodo de lactancia.',
        ELP_ERROR_CODES.NO_ACTIVE_SHIFT,
        422,
        'lactation-period-no-active-shift'
      )
    }

    return {
      lactationPeriodId: period.employeeLactationPeriodId,
      regeneratedExceptionsCount: result.generatedCount,
      omittedDaysWithoutShift: result.omittedDaysWithoutShift,
      skippedDaysWithConflict: result.skippedDaysWithConflict,
    }
  }

  /** Cantidad de días naturales en el rango inclusivo. */
  private countDaysInRange(start: DateTime, end: DateTime): number {
    if (!start.isValid || !end.isValid || end < start) return 0
    return Math.floor(end.startOf('day').diff(start.startOf('day'), 'days').days) + 1
  }

  /**
   * Normaliza `string | Date | DateTime` a un `DateTime` en UTC-6 que conserva
   * el componente de fecha tal cual viene de BD. Convierte explícitamente a
   * UTC antes de extraer el componente de fecha porque Lucid `@column.date()`
   * envuelve el `Date` de mysql2 con `DateTime.fromJSDate(date)` sin zona y
   * el `DateTime` queda en la zona local del proceso, lo cual al hacer
   * `toISODate()` devuelve el día anterior (medianoche UTC vista en UTC-6).
   * Misma estrategia que en `ShiftExceptionService.toDateTime`.
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
    return DateTime.invalid('Fecha no parseable para lactancia')
  }

  /** Soft delete (Lucid + adonis-lucid-soft-deletes). Idempotente sobre la fila. */
  // async destroy(periodId: number, allowedBusinessUnitIds: number[] = []) {
  //   const period = await this.findPeriodInCompanyOrFail(periodId, allowedBusinessUnitIds)
  //   await period.delete()
  //   return serializeLactationPeriod(period)
  // }

  /**
   * Variante pública de `findPeriodInCompanyOrFail` para que servicios vecinos
   * (por ejemplo `EmployeeLactationPeriodEvidenceService`) puedan validar la
   * pertenencia tenant de un periodo antes de operar sobre sus recursos hijos,
   * sin duplicar el query ni la lógica multitenant.
   */
  async ensurePeriodAccessible(
    periodId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<EmployeeLactationPeriod> {
    return this.findPeriodInCompanyOrFail(periodId, allowedBusinessUnitIds)
  }

  /**
   * Recupera un periodo no borrado cuya empleada pertenezca a la empresa actual.
   * Lanza 404 cuando no existe o vive en otra empresa.
   */
  private async findPeriodInCompanyOrFail(periodId: number, allowedBusinessUnitIds: number[] = []) {
    const period = await EmployeeLactationPeriod.query()
      .where('employee_lactation_period_id', periodId)
      .whereNull('employee_lactation_period_deleted_at')
      .whereHas('employee', (q) => {
        q.whereNull('employee_deleted_at')
        if (allowedBusinessUnitIds.length > 0) {
          q.whereIn('business_unit_id', allowedBusinessUnitIds)
        } else {
          q.whereRaw('1 = 0')
        }
      })
      .first()

    if (!period) {
      throw new EmployeeLactationPeriodError(
        'El periodo de lactancia no existe o no pertenece a la empresa actual.',
        ELP_ERROR_CODES.PERIOD_NOT_FOUND,
        404
      )
    }
    return period
  }

  /**
   * Verifica que la empleada exista, no esté dada de baja y pertenezca a una
   * unidad de negocio dentro del scope central del tenant.
   */
  private async ensureEmployeeBelongsToCompany(employeeId: number, allowedBusinessUnitIds: number[] = []) {
    if (allowedBusinessUnitIds.length === 0) {
      throw new EmployeeLactationPeriodError(
        'No hay unidades de negocio activas para el usuario autenticado.',
        ELP_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        404
      )
    }

    const employee = await Employee.query()
      .where('employee_id', employeeId)
      .whereNull('employee_deleted_at')
      .whereIn('business_unit_id', allowedBusinessUnitIds)
      .first()

    if (!employee) {
      throw new EmployeeLactationPeriodError(
        'La empleada no existe o no pertenece a la empresa actual.',
        ELP_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        404
      )
    }
  }

  /**
   * Garantiza coherencia estricta: la fecha fin debe ser posterior a la de inicio.
   * Devuelve 400 con código `DATE_RANGE_INVALID` (Vine ya hace check formal).
   */
  private assertDateCoherence(startDate: DateTime, endDate: DateTime) {
    if (!startDate.isValid || !endDate.isValid) {
      throw new EmployeeLactationPeriodError(
        'Las fechas del periodo de lactancia son inválidas.',
        ELP_ERROR_CODES.DATE_RANGE_INVALID,
        400
      )
    }
    if (endDate <= startDate) {
      throw new EmployeeLactationPeriodError(
        'La fecha de fin debe ser posterior a la fecha de inicio.',
        ELP_ERROR_CODES.DATE_RANGE_INVALID,
        400
      )
    }
  }

  /**
   * Valida el rango contra los dos extremos legales/operativos:
   *  - Mínimo legal LFT 170 IV: 6 meses. Captura por debajo se rechaza
   *    con 422 y key estable `lactation-period-below-legal-minimum`.
   *  - Máximo operativo (sanity check): 24 meses. Captura por encima se
   *    rechaza con 422 y key estable `lactation-period-unreasonable-range`.
   *
   * Las empresas pueden EXTENDER el periodo voluntariamente por encima
   * del mínimo legal hasta el tope de 24 meses; el warning suave de
   * "supera 6 meses" lo gestiona el cliente.
   */
  private assertWithinReasonableRange(startDate: DateTime, endDate: DateTime) {
    const diffMonths = endDate.diff(startDate, 'months').months
    if (diffMonths < MIN_LACTATION_RANGE_MONTHS) {
      throw new EmployeeLactationPeriodError(
        'El rango de lactancia es menor al mínimo legal de 6 meses (LFT artículo 170).',
        ELP_ERROR_CODES.RANGE_BELOW_LEGAL_MINIMUM,
        422,
        'lactation-period-below-legal-minimum'
      )
    }
    if (diffMonths > MAX_LACTATION_RANGE_MONTHS) {
      throw new EmployeeLactationPeriodError(
        'El rango de lactancia supera el máximo de 24 meses permitido por captura.',
        ELP_ERROR_CODES.RANGE_UNREASONABLE,
        422,
        'lactation-period-unreasonable-range'
      )
    }
  }

  /**
   * Verifica que no exista solape contra OTRO periodo activo (no soft-deleted)
   * del mismo empleado. Solape estándar: `start <= otherEnd && end >= otherStart`.
   *
   * @param excludeId Identificador a excluir cuando se está editando.
   */
  private async assertNoOverlap(
    employeeId: number,
    startDate: DateTime,
    endDate: DateTime,
    excludeId?: number
  ) {
    const startIso = startDate.toISODate()
    const endIso = endDate.toISODate()
    if (!startIso || !endIso) {
      return
    }

    const query = EmployeeLactationPeriod.query()
      .where('employee_id', employeeId)
      .whereNull('employee_lactation_period_deleted_at')
      .where('employee_lactation_period_start_date', '<=', endIso)
      .where('employee_lactation_period_end_date', '>=', startIso)

    if (excludeId !== undefined) {
      query.whereNot('employee_lactation_period_id', excludeId)
    }

    const conflict = await query.first()
    if (conflict) {
      throw new EmployeeLactationPeriodError(
        'La empleada ya tiene un periodo de lactancia activo en ese rango.',
        ELP_ERROR_CODES.PERIOD_OVERLAP,
        409,
        'lactation-period-overlap'
      )
    }
  }

  /**
   * Parsea fechas de entrada del cliente. Fuerza zona `UTC-6` para que la
   * representación interna no se desvíe según el timezone del proceso. Acepta
   * tanto `YYYY-MM-DD` como ISO completo y `DateTime` ya construido.
   */
  private parseDate(value: string | DateTime): DateTime {
    if (DateTime.isDateTime(value)) {
      const iso = (value as DateTime).toISODate()
      return iso ? DateTime.fromISO(iso, { zone: 'UTC-6' }) : (value as DateTime)
    }
    const head = String(value).length >= 10 ? String(value).substring(0, 10) : String(value)
    const parsed = DateTime.fromISO(head, { zone: 'UTC-6' })
    if (!parsed.isValid) {
      throw new EmployeeLactationPeriodError(
        'Las fechas del periodo de lactancia son inválidas.',
        ELP_ERROR_CODES.DATE_RANGE_INVALID,
        400
      )
    }
    return parsed
  }

  private normalizeNotes(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null
    }
    const trimmed = String(value).trim()
    return trimmed.length === 0 ? null : trimmed
  }

  /**
   * Verifica que el `employeeChildrenId` exista, no esté borrado y
   * pertenezca al `employeeId` del periodo. Lanza 422 con key estable
   * `hijo-no-pertenece-al-empleado` cuando no aplica.
   *
   * Implementación a propósito directa contra `EmployeeChildren` (sin
   * salto al `EmployeeChildrenService`) para evitar ciclos de imports
   * con servicios que ya consumen este módulo, y para mantener la
   * verificación atómica (un sólo query antes de la transacción).
   *
   * NO valida BU del empleado: ese check ya lo hicimos antes con
   * `ensureEmployeeBelongsToCompany`. Aquí sólo aseguramos pertenencia
   * hijo↔empleada.
   */
  private async assertChildBelongsToEmployee(
    employeeChildrenId: number,
    employeeId: number
  ) {
    const child = await EmployeeChildren.query()
      .where('employee_children_id', employeeChildrenId)
      .whereNull('employee_children_deleted_at')
      .first()

    if (!child || child.employeeId !== employeeId) {
      throw new EmployeeLactationPeriodError(
        'El hijo seleccionado no pertenece a la empleada del periodo de lactancia.',
        ELP_ERROR_CODES.CHILD_NOT_OWNED,
        422,
        'hijo-no-pertenece-al-empleado'
      )
    }
  }

}
