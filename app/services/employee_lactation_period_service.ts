import { DateTime } from 'luxon'
import env from '#start/env'
import EmployeeLactationPeriod, {
  type EmployeeLactationPeriodReductionApplication,
  type EmployeeLactationPeriodType,
} from '#models/employee_lactation_period'
import Employee from '#models/employee'
import BusinessUnit from '#models/business_unit'
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
 *   pertenecer a una `business_unit` activa cuyo slug esté en SYSTEM_BUSINESS.
 *   El aislamiento se aplica en cada operación (read / write).
 * - Aplica las reglas de negocio (coherencia de fechas, sanity de 24 meses,
 *   traslape contra periodos activos del mismo empleado).
 */
export default class EmployeeLactationPeriodService {
  /**
   * Lista paginada de periodos de lactancia visibles para la empresa actual.
   * Orden: `employee_lactation_period_start_date DESC`.
   *
   * @param page Página (1-indexada).
   * @param limit Tamaño de página (máximo 500).
   * @param employeeId Filtra por empleada específica.
   */
  async listPaginated(page: number, limit: number, employeeId?: number) {
    const safeLimit = Math.min(Math.max(limit, 1), 500)
    const safePage = Math.max(page, 1)
    const allowedBusinessUnitIds = await this.getAllowedBusinessUnitIds()

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
   */
  async create(payload: EmployeeLactationPeriodCreatePayload) {
    await this.ensureEmployeeBelongsToCompany(payload.employeeId)

    const startDate = this.parseDate(payload.employeeLactationPeriodStartDate)
    const endDate = this.parseDate(payload.employeeLactationPeriodEndDate)

    this.assertDateCoherence(startDate, endDate)
    this.assertWithinReasonableRange(startDate, endDate)
    await this.assertNoOverlap(payload.employeeId, startDate, endDate)

    const period = new EmployeeLactationPeriod()
    period.employeeId = payload.employeeId
    period.employeeLactationPeriodStartDate = startDate
    period.employeeLactationPeriodEndDate = endDate
    period.employeeLactationPeriodType = payload.employeeLactationPeriodType
    period.employeeLactationPeriodReductionApplication =
      payload.employeeLactationPeriodReductionApplication ?? DEFAULT_REDUCTION_APPLICATION
    period.employeeLactationPeriodNotes = this.normalizeNotes(
      payload.employeeLactationPeriodNotes
    )
    await period.save()

    return serializeLactationPeriod(period)
  }

  /**
   * Edita un periodo existente. Acepta cualquier subconjunto de campos.
   * Si se cambia `employeeId`, valida nuevamente pertenencia a la empresa.
   * Si cambian fechas, vuelve a validar coherencia, sanity y traslape.
   */
  async update(periodId: number, payload: EmployeeLactationPeriodUpdatePayload) {
    const period = await this.findPeriodInCompanyOrFail(periodId)

    const nextEmployeeId = payload.employeeId ?? period.employeeId
    if (payload.employeeId && payload.employeeId !== period.employeeId) {
      await this.ensureEmployeeBelongsToCompany(payload.employeeId)
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

    await period.save()
    await period.refresh()

    return serializeLactationPeriod(period)
  }

  /** Soft delete (Lucid + adonis-lucid-soft-deletes). Idempotente sobre la fila. */
  async destroy(periodId: number) {
    const period = await this.findPeriodInCompanyOrFail(periodId)
    await period.delete()
    return serializeLactationPeriod(period)
  }

  /**
   * Recupera un periodo no borrado cuya empleada pertenezca a la empresa actual.
   * Lanza 404 cuando no existe o vive en otra empresa.
   */
  private async findPeriodInCompanyOrFail(periodId: number) {
    const allowedBusinessUnitIds = await this.getAllowedBusinessUnitIds()
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
   * unidad de negocio permitida por SYSTEM_BUSINESS.
   */
  private async ensureEmployeeBelongsToCompany(employeeId: number) {
    const allowedBusinessUnitIds = await this.getAllowedBusinessUnitIds()
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

  private parseDate(value: string | DateTime): DateTime {
    if (DateTime.isDateTime(value)) {
      return value as DateTime
    }
    const parsed = DateTime.fromISO(String(value))
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
   * Devuelve los IDs de unidades de negocio activas a las que el usuario
   * autenticado puede llegar (alineado a SYSTEM_BUSINESS, patrón vigente del repo).
   */
  private async getAllowedBusinessUnitIds(): Promise<number[]> {
    const businessConf = `${env.get('SYSTEM_BUSINESS') ?? ''}`
    const businessSlugs = businessConf
      .split(',')
      .map((slug) => slug.trim())
      .filter((slug) => slug.length > 0)

    if (businessSlugs.length === 0) {
      return []
    }

    const businessUnits = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessSlugs)
      .select('business_unit_id')

    return businessUnits.map((bu) => bu.businessUnitId)
  }

}
