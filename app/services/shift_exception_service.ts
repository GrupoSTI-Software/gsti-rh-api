import ShiftException from '#models/shift_exception'
import { DateTime } from 'luxon'
import { ShiftExceptionFilterInterface } from '../interfaces/shift_exception_filter_interface.js'
import { LogShiftException } from '../interfaces/MongoDB/log_shift_exception.js'
import { LogStore } from '#models/MongoDB/log_store'
import ShiftExceptionEvidence from '#models/shift_exception_evidence'
import SyncAssistsService from './sync_assists_service.js'
import { SyncAssistsServiceIndexInterface } from '../interfaces/sync_assists_service_index_interface.js'
import ExceptionType from '#models/exception_type'
import Employee from '#models/employee'
import { I18n } from '@adonisjs/i18n'
import EmployeeShift from '#models/employee_shift'
import ShiftForEmployeeService from './shift_for_employees_service.js'
import type { ShiftRecordInterface } from '../interfaces/shift_record_interface.js'
import type { EmployeeRecordInterface } from '../interfaces/employee_record_interface.js'
import Holiday from '#models/holiday'
import env from '#start/env'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import EmployeeLactationPeriod from '#models/employee_lactation_period'
import logger from '@adonisjs/core/services/logger'
import { ELP_ERROR_CODES } from '../constants/employee_lactation_period_error_codes.js'
import { EmployeeLactationPeriodError } from '../exceptions/employee_lactation_period_error.js'

/**
 * Slug del tipo de excepción que representa una jornada reducida por lactancia.
 * Persistido por `database/seeders/0028_lactation_exception_type_seeder.ts`.
 */
const LACTATION_EXCEPTION_TYPE_SLUG = 'lactancia'

/**
 * Minutos a reducir según `(employeeLactationPeriodType, employeeLactationPeriodReductionApplication)`.
 *
 * - `reduced_hour` ≡ 60 min de jornada reducida.
 * - `two_rest_periods` ≡ 30 min totales (la otra media hora del derecho LFT 170 IV
 *   se asume como reposo intra-jornada que no requiere modificación del marcaje).
 *
 * Para `split` se reparte la mitad al inicio y la mitad al final para ofrecer
 * la flexibilidad documentada como convención del repo:
 * - reduced_hour split → 30 min entrada + 30 min salida.
 * - two_rest_periods split → 15 min entrada + 15 min salida.
 */
const LACTATION_REDUCTION_MINUTES: Record<
  'reduced_hour' | 'two_rest_periods',
  { full: number; halfStart: number; halfEnd: number }
> = {
  reduced_hour: { full: 60, halfStart: 30, halfEnd: 30 },
  two_rest_periods: { full: 30, halfStart: 15, halfEnd: 15 },
}

/**
 * Información mínima del shift necesaria para calcular check-in/out de la excepción.
 */
interface LactationShiftInfo {
  shiftTimeStart: string
  shiftActiveHours: number
  shiftRestDays: string
}

/**
 * Asignación de turno vigente para una fecha concreta.
 */
interface LactationActiveAssignment {
  applySince: DateTime
  shift: LactationShiftInfo
}

/**
 * Resultado de generar/regenerar excepciones por periodo. `omittedDaysWithoutShift`
 * lista las fechas (ISO `YYYY-MM-DD`) que se saltaron porque la empleada no
 * tenía `EmployeeShift` activo ese día — útil para mostrarlas como warning al admin.
 */
export interface LactationShiftExceptionsResult {
  lactationPeriodId: number
  generatedCount: number
  omittedDaysWithoutShift: string[]
}

export default class ShiftExceptionService {

  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }

  async create(shiftException: ShiftException) {
    const newShiftException = new ShiftException()
    newShiftException.employeeId = shiftException.employeeId
    newShiftException.shiftExceptionsDescription = shiftException.shiftExceptionsDescription
    newShiftException.shiftExceptionsDate = shiftException.shiftExceptionsDate
    newShiftException.exceptionTypeId = shiftException.exceptionTypeId
    newShiftException.vacationSettingId = shiftException.vacationSettingId
    newShiftException.shiftExceptionCheckInTime = shiftException.shiftExceptionCheckInTime
    newShiftException.shiftExceptionCheckOutTime = shiftException.shiftExceptionCheckOutTime
    newShiftException.shiftExceptionEnjoymentOfSalary =
      shiftException.shiftExceptionEnjoymentOfSalary
    newShiftException.shiftExceptionTimeByTime = shiftException.shiftExceptionTimeByTime
    newShiftException.workDisabilityPeriodId = shiftException.workDisabilityPeriodId
    await newShiftException.save()

    const exceptionDate = newShiftException.shiftExceptionsDate
    const date = typeof exceptionDate === 'string' ? new Date(exceptionDate) : exceptionDate
    await this.updateAssistCalendar(shiftException.employeeId, date)

    return newShiftException
  }

  async update(currentShiftException: ShiftException, shiftException: ShiftException) {
    currentShiftException.employeeId = shiftException.employeeId
    currentShiftException.shiftExceptionsDescription = shiftException.shiftExceptionsDescription
    currentShiftException.shiftExceptionsDate = shiftException.shiftExceptionsDate
    currentShiftException.exceptionTypeId = shiftException.exceptionTypeId
    currentShiftException.vacationSettingId = shiftException.vacationSettingId
    currentShiftException.shiftExceptionCheckInTime = shiftException.shiftExceptionCheckInTime
    currentShiftException.shiftExceptionCheckOutTime = shiftException.shiftExceptionCheckOutTime
    currentShiftException.shiftExceptionEnjoymentOfSalary =
      shiftException.shiftExceptionEnjoymentOfSalary
    currentShiftException.shiftExceptionTimeByTime = shiftException.shiftExceptionTimeByTime
    await currentShiftException.save()

    const exceptionDate = currentShiftException.shiftExceptionsDate
    const date = typeof exceptionDate === 'string' ? new Date(exceptionDate) : exceptionDate
    await this.updateAssistCalendar(shiftException.employeeId, date)

    return currentShiftException
  }

  async show(shiftExceptionId: number) {
    const shiftException = await ShiftException.query()
      .whereNull('shift_exceptions_deleted_at')
      .where('shift_exception_id', shiftExceptionId)
      .first()
    return shiftException ? shiftException : null
  }


  async getByEmployee(filters: ShiftExceptionFilterInterface) {
    const shiftExceptions = await ShiftException.query()
      .whereNull('shift_exceptions_deleted_at')
      .where('employee_id', filters.employeeId)
      .if(filters.exceptionTypeId > 0, (query) => {
        query.where('exception_type_id', filters.exceptionTypeId)
      })
      .if(filters.dateStart && filters.dateEnd, (query) => {
        const stringDate = `${filters.dateStart}T00:00:00.000-06:00`
        const time = DateTime.fromISO(stringDate, { setZone: true })
        const timeCST = time.setZone('UTC-6')
        const filterInitialDate = timeCST.toFormat('yyyy-LL-dd HH:mm:ss')
        const stringEndDate = `${filters.dateEnd}T23:59:59.000-06:00`
        const timeEnd = DateTime.fromISO(stringEndDate, { setZone: true })
        const timeEndCST = timeEnd.setZone('UTC-6')
        const filterEndDate = timeEndCST.toFormat('yyyy-LL-dd HH:mm:ss')
        query.where('shift_exceptions_date', '>=', filterInitialDate)
        query.where('shift_exceptions_date', '<=', filterEndDate)
      })
      .preload('exceptionType')
      .preload('vacationSetting')
      .orderBy('shift_exceptions_date')
    return shiftExceptions
  }

  isValidDate(date: string) {
    try {
      date = date.replaceAll('"', '')
      let dt = DateTime.fromFormat(date, 'yyyy-MM-dd')
      if (dt.isValid) {
        return true
      } else {
        dt = DateTime.fromISO(date)
        if (dt.isValid) {
          return true
        }
      }
    } catch (error) {}
    return false
  }

  getDateAndTime(shiftExceptionsDate: string) {
    // const dateAndTime = shiftExceptionsDate.toString()
    // if (dateAndTime.toString().includes('T')) {
    //   let [date, horaConZona] = dateAndTime.split('T')
    //   const time = horaConZona.replaceAll('"', '').substring(0, 8)
    //   return `${date.replaceAll('"', '')} ${time}`
    // } else {
    //   let [date, horaConZona] = dateAndTime.split(' ')
    //   const time = horaConZona.replaceAll('"', '').substring(0, 8)
    //   return `${date.replaceAll('"', '')} ${time}`
    // }
    return `${shiftExceptionsDate}T00:00:00.000-06:00`
  }


  async verifyInfoExist(shiftException: ShiftException) {
    const existExceptionType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_id', shiftException.exceptionTypeId)
      .first()

    if (!existExceptionType && shiftException.exceptionTypeId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The exception type was not found',
        message: 'The exception type was not found with the entered ID',
        data: { ...shiftException },
      }
    }

    const existEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', shiftException.employeeId)
      .first()

    if (!existEmployee && shiftException.employeeId) {
      return {
        status: 400,
        type: 'warning',
        title: 'The employee was not found',
        message: 'The employee was not found with the entered ID',
        data: { ...shiftException },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...shiftException },
    }
  }

  async verifyInfo(shiftException: ShiftException) {
    const action = shiftException.shiftExceptionId > 0 ? 'update' : 'create'
    const existDate = await ShiftException.query()
      .if(shiftException.shiftExceptionId > 0, (query) => {
        query.whereNot('shift_exception_id', shiftException.shiftExceptionId)
      })
      .where('exception_type_id', shiftException.exceptionTypeId)
      .whereNull('shift_exceptions_deleted_at')
      .where('shift_exceptions_date', shiftException.shiftExceptionsDate)
      .where('employee_id', shiftException.employeeId)
      .first()

    if (existDate) {
      return {
        status: 400,
        type: 'warning',
        title: 'The date exists in other exception',
        message: `The shift exception resource cannot be ${action} because this exception type is already assigned on the same date for the same employee.`,
        data: { ...shiftException },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verifiy successfully',
      data: { ...shiftException },
    }
  }

  createActionLog(rawHeaders: string[], action: string) {
    const date = DateTime.local().setZone('utc').toISO()
    const userAgent = this.getHeaderValue(rawHeaders, 'User-Agent')
    const secChUaPlatform = this.getHeaderValue(rawHeaders, 'sec-ch-ua-platform')
    const secChUa = this.getHeaderValue(rawHeaders, 'sec-ch-ua')
    const origin = this.getHeaderValue(rawHeaders, 'Origin')
    const logShiftException = {
      action: action,
      user_agent: userAgent,
      sec_ch_ua_platform: secChUaPlatform,
      sec_ch_ua: secChUa,
      origin: origin,
      date: date ? date : '',
    } as LogShiftException
    return logShiftException
  }

  async saveActionOnLog(logShiftException: LogShiftException, table: string) {
    try {
      const employeeId = logShiftException.record_current?.employeeId
      if (employeeId) {
        const employeeShiftId = await this.getEmployeeShiftId(employeeId)
        logShiftException.employeeShiftId = employeeShiftId
      }
      await LogStore.set(table, logShiftException)
    } catch (err) {}
  }

  async getEmployeeShiftId(employeeId: number): Promise<number | null> {
    try {
      const today = new Date().toISOString().split('T')[0]
      const employeeShift = await EmployeeShift.query()
        .whereNull('employe_shifts_deleted_at')
        .where('employee_id', employeeId)
        .whereRaw('DATE(employe_shifts_apply_since) <= ?', [today])
        .orderBy('employe_shifts_apply_since', 'desc')
        .first()
      return employeeShift?.shiftId || null
    } catch (error) {
      return null
    }
  }

  getHeaderValue(headers: Array<string>, headerName: string) {
    const index = headers.indexOf(headerName)
    return index !== -1 ? headers[index + 1] : null
  }

  async getEvidences(shiftExceptionId: number) {
    const shiftExceptionEvidences = await ShiftExceptionEvidence.query()
      .whereNull('shift_exception_evidence_deleted_at')
      .where('shift_exception_id', shiftExceptionId)

    return shiftExceptionEvidences ? shiftExceptionEvidences : []
  }

  async updateAssistCalendar(employeeId: number, date: Date) {
    const dateStart = new Date(date)
    dateStart.setDate(dateStart.getDate() - 24)

    const dateEnd = new Date(date)
    dateEnd.setDate(dateEnd.getDate() + 1)

    const filter: SyncAssistsServiceIndexInterface = {
        date: this.formatDate(dateStart),
        dateEnd: this.formatDate(dateEnd),
        employeeID: employeeId
      }
      const syncAssistsService = new SyncAssistsService(this.i18n)
      await syncAssistsService.setDateCalendar(filter)
  }

  formatDate(date: Date): string {
    return date.toISOString().split('T')[0]
  }

  /**
   * Obtiene el turno asignado al empleado para una fecha, respetando apply_since
   * (misma lógica que SyncAssistsService.getAssignedDateShift).
   */
  private getAssignedDateShiftForDate(
    compareDateTime: DateTime,
    dailyShifts: ShiftRecordInterface[]
  ): ShiftRecordInterface | undefined {
    const checkTime = compareDateTime.setZone('UTC-6')
    const availableShifts = dailyShifts.filter((shift) => {
      const shiftDate = DateTime.fromJSDate(new Date(shift.employeShiftsApplySince)).setZone('UTC-6')
      return checkTime >= shiftDate
    })
    const sorted = availableShifts.sort(
      (a, b) =>
        new Date(b.employeShiftsApplySince).getTime() -
        new Date(a.employeShiftsApplySince).getTime()
    )
    return sorted[0]
  }

  /**
   * Indica si el día es de descanso según el turno (shiftRestDays, 1-7).
   * Misma lógica que SyncAssistsService.isRestDay usando día natural en UTC-6.
   */
  private isRestDayForShift(dayDate: DateTime, shiftRestDays: string): boolean {
    const naturalDay = dayDate.setZone('UTC-6').toFormat('c')
    const restDays = shiftRestDays.split(',').map((d) => d.trim())
    return restDays.some((d) => Number.parseInt(d, 10) === Number.parseInt(naturalDay, 10))
  }

  /**
   * Slugs de tipos de excepción que se consideran "no laborables" para asignar vacaciones:
   * descanso por permiso, permiso de falta, permiso de incapacidad, incapacidad por maternidad.
   * Esos días se saltan al calcular días hábiles para vacaciones.
   */
  private static readonly EXCEPTION_SLUGS_NON_WORK_DAY = new Set([
    'rest-day', // descanso como permiso
    'absence-from-work', // permiso de falta
    'falta-por-incapacidad', // permiso de incapacidad
    'incapacidad-por-maternidad', // incapacidad por maternidad
    // si es necesario agregar más, agregar aquí 
  ])

  /**
   * Obtiene las fechas que son días hábiles (laborales) para el empleado en el rango,
   * excluyendo: días de descanso del turno, festivos de descanso oficial, y días con
   * excepciones de descanso/permiso/falta/incapacidad.
   * Usado para vacaciones: solo se asignan días que son laborales.
   */
  async getVacationBusinessDays(
    employeeId: number,
    startDate: DateTime,
    daysToApply: number
  ): Promise<string[]> {
    if (daysToApply <= 0) {
      return []
    }

    const dateStart = startDate.setZone('UTC-6').startOf('day')
    const rangeEnd = dateStart.plus({ days: Math.max(daysToApply * 3 + 31, 90) })
    const filterDateStart = dateStart.minus({ years: 10 }).toFormat('yyyy-LL-dd')
    const filterDateEnd = rangeEnd.toFormat('yyyy-LL-dd')

    const serviceResponse = await new ShiftForEmployeeService().getEmployeeShifts(
      { dateStart: filterDateStart, dateEnd: filterDateEnd, employeeId },
      999999,
      1
    )

    if (serviceResponse.status !== 200 || !serviceResponse.data?.data) {
      return []
    }

    const dailyShifts = (serviceResponse.data.data as EmployeeRecordInterface[])[0]
    const employeeShifts: ShiftRecordInterface[] = (dailyShifts?.employeeShifts ||
      []) as ShiftRecordInterface[]

    if (employeeShifts.length === 0) {
      return []
    }

    const [officialHolidayDates, datesWithRestOrPermission] = await Promise.all([
      this.getOfficialHolidayDatesInRange(
        dateStart.toFormat('yyyy-LL-dd'),
        rangeEnd.toFormat('yyyy-LL-dd')
      ),
      this.getDatesWithRestOrPermissionExceptions(
        employeeId,
        dateStart.toFormat('yyyy-LL-dd'),
        rangeEnd.toFormat('yyyy-LL-dd')
      ),
    ])

    const businessDays: string[] = []
    let current = dateStart

    while (businessDays.length < daysToApply && current <= rangeEnd) {
      const dateShift = this.getAssignedDateShiftForDate(current, employeeShifts)
      if (!dateShift?.shift) {
        current = current.plus({ days: 1 })
        continue
      }
      const isRest = this.isRestDayForShift(current, dateShift.shift.shiftRestDays)
      const dateStr = current.toFormat('yyyy-LL-dd')
      const isOfficialHoliday = officialHolidayDates.has(dateStr)
      const hasRestOrPermissionException = datesWithRestOrPermission.has(dateStr)
      if (!isRest && !isOfficialHoliday && !hasRestOrPermissionException) {
        businessDays.push(dateStr)
      }
      current = current.plus({ days: 1 })
    }

    return businessDays
  }

  /**
   * Devuelve las fechas (yyyy-MM-dd) en las que el empleado tiene alguna excepción
   * que se considera no laborable: descanso como permiso, falta, incapacidad, maternidad.
   */
  private async getDatesWithRestOrPermissionExceptions(
    employeeId: number,
    firstDate: string,
    lastDate: string
  ): Promise<Set<string>> {
    const slugs = ShiftExceptionService.EXCEPTION_SLUGS_NON_WORK_DAY
    const exceptions = await ShiftException.query()
      .where('employee_id', employeeId)
      .whereRaw('DATE(shift_exceptions_date) >= ?', [firstDate])
      .whereRaw('DATE(shift_exceptions_date) <= ?', [lastDate])
      .whereNull('shift_exceptions_deleted_at')
      .preload('exceptionType')
      .select('shift_exceptions_date', 'exception_type_id')

    const dates = new Set<string>()
    for (const ex of exceptions) {
      const slug = ex.exceptionType?.exceptionTypeSlug
      if (slug && slugs.has(slug)) {
        const d =
          typeof ex.shiftExceptionsDate === 'string'
            ? ex.shiftExceptionsDate
            : DateTime.fromJSDate(ex.shiftExceptionsDate as unknown as Date).toFormat('yyyy-LL-dd')
        dates.add(d.split('T')[0])
      }
    }
    return dates
  }

  /**
   * Carga fechas de festivos con descanso oficial en el rango y las devuelve como Set.
   */
  private async getOfficialHolidayDatesInRange(
    firstDate: string,
    lastDate: string
  ): Promise<Set<string>> {
    const businessConf = env.get('SYSTEM_BUSINESS', '')
    const businessList = businessConf ? businessConf.split(',').map((b) => b.trim()) : []

    const query = Holiday.query()
      .where('holidayDate', '>=', firstDate)
      .where('holidayDate', '<=', lastDate)
      .where('holidayIsOfficialRestDay', true)
      .whereNull('holiday_deleted_at')

    if (businessList.length > 0) {
      query.andWhere((q) => {
        businessList.forEach((business) => {
          q.orWhereRaw('FIND_IN_SET(?, holiday_business_units)', [business])
        })
      })
    }

    const holidays = await query.select('holidayDate')
    const dates = new Set<string>()
    for (const h of holidays) {
      const d =
        typeof h.holidayDate === 'string'
          ? h.holidayDate
          : DateTime.fromJSDate(h.holidayDate as unknown as Date).toFormat('yyyy-LL-dd')
      dates.add(d)
    }
    return dates
  }

  // ---------------------------------------------------------------------------
  //  INTEGRACIÓN CON `employee_lactation_periods`
  // ---------------------------------------------------------------------------

  /**
   * Genera las excepciones diarias de turno para todo el rango de un periodo de
   * lactancia. Itera día por día desde la fecha de inicio hasta la fecha de fin
   * (inclusivas), respetando el `EmployeeShift` vigente para cada fecha y los
   * `shiftRestDays` del turno (los descansos se omiten). El ajuste de
   * `shiftExceptionCheckInTime` / `shiftExceptionCheckOutTime` depende de
   * `employeeLactationPeriodType` y `employeeLactationPeriodReductionApplication`:
   *
   * - `reduced_hour` ⇒ 60 min. `start`: entrada +1h. `end` (default): salida -1h.
   *   `split`: entrada +30min y salida -30min.
   * - `two_rest_periods` ⇒ 30 min. `start`: entrada +30min. `end`: salida -30min.
   *   `split`: entrada +15min y salida -15min.
   *
   * Los días sin `EmployeeShift` activo NO hacen fallar la generación: se
   * registran en `omittedDaysWithoutShift` para que el admin pueda regenerar
   * después de asignar turno. Si el tipo de excepción `lactancia` no existe en
   * `exception_types`, se lanza `EmployeeLactationPeriodError` 500 con key
   * `lactation-exception-type-missing` para que el caller haga rollback.
   *
   * @param periodId Identificador del periodo de lactancia.
   * @param trx Transacción opcional. Si se pasa, todas las operaciones se ejecutan
   *            dentro de ella (las inserciones, lecturas y soft-deletes); si no,
   *            se ejecutan con el cliente por defecto.
   */
  async generateForLactationPeriod(
    periodId: number,
    trx?: TransactionClientContract
  ): Promise<LactationShiftExceptionsResult> {
    const period = await this.loadLactationPeriodOrThrow(periodId, trx)
    const exceptionTypeId = await this.resolveLactationExceptionTypeId(trx)

    return this.generateExceptionsForRange({
      period,
      exceptionTypeId,
      rangeStart: this.toDateTime(period.employeeLactationPeriodStartDate),
      rangeEnd: this.toDateTime(period.employeeLactationPeriodEndDate),
      trx,
    })
  }

  /**
   * Borra (soft-delete) las excepciones FUTURAS vinculadas al periodo
   * (fecha `>= hoy`) y vuelve a generarlas. Las excepciones pasadas no se
   * tocan para preservar el histórico de marcaje.
   *
   * Usado por `EmployeeLactationPeriodService.update` cuando cambian las
   * fechas, el tipo o la modalidad de aplicación. Si no quedan días futuros
   * dentro del rango, regresa `generatedCount=0` sin error.
   */
  async regenerateForLactationPeriod(
    periodId: number,
    trx?: TransactionClientContract
  ): Promise<LactationShiftExceptionsResult> {
    const period = await this.loadLactationPeriodOrThrow(periodId, trx)
    const exceptionTypeId = await this.resolveLactationExceptionTypeId(trx)

    const today = DateTime.now().setZone('UTC-6').startOf('day')
    const periodStart = this.toDateTime(period.employeeLactationPeriodStartDate)
    const periodEnd = this.toDateTime(period.employeeLactationPeriodEndDate)

    // Soft-delete sólo futuras
    await this.softDeleteFutureExceptionsByPeriod(periodId, today, trx)

    const rangeStart = periodStart > today ? periodStart : today
    if (rangeStart > periodEnd) {
      return {
        lactationPeriodId: periodId,
        generatedCount: 0,
        omittedDaysWithoutShift: [],
      }
    }

    return this.generateExceptionsForRange({
      period,
      exceptionTypeId,
      rangeStart,
      rangeEnd: periodEnd,
      trx,
    })
  }

  /**
   * Regeneración TOTAL: borra (soft-delete) TODAS las excepciones vinculadas al
   * periodo (pasadas y futuras) y vuelve a generarlas para el rango completo.
   *
   * Usado por el endpoint manual `POST /:id/regenerate-shift-exceptions`. A
   * diferencia de `regenerateForLactationPeriod`, no protege el histórico: la
   * suposición es que el admin lo invoca cuando sospecha de desincronización
   * o cuando asignó un turno retroactivo y quiere reconstruir la línea
   * completa de excepciones. El propio motor de asistencia se recalcula sobre
   * los marcajes; perder y rehacer la excepción de un día pasado no genera
   * pérdida de datos sustantivos.
   */
  async regenerateAllForLactationPeriod(
    periodId: number,
    trx?: TransactionClientContract
  ): Promise<LactationShiftExceptionsResult> {
    const period = await this.loadLactationPeriodOrThrow(periodId, trx)
    const exceptionTypeId = await this.resolveLactationExceptionTypeId(trx)

    const periodStart = this.toDateTime(period.employeeLactationPeriodStartDate)
    const periodEnd = this.toDateTime(period.employeeLactationPeriodEndDate)

    // Soft-delete TOTAL (incluye pasadas)
    const now = DateTime.now().toSQL({ includeOffset: false })
    const baseQuery = trx ? ShiftException.query({ client: trx }) : ShiftException.query()
    await baseQuery
      .where('lactation_period_id', periodId)
      .whereNull('shift_exceptions_deleted_at')
      .update({ shift_exceptions_deleted_at: now })

    return this.generateExceptionsForRange({
      period,
      exceptionTypeId,
      rangeStart: periodStart,
      rangeEnd: periodEnd,
      trx,
    })
  }

  /**
   * Soft-delete masivo de TODAS las excepciones vinculadas al periodo (incluyendo
   * pasadas y futuras). Se invoca antes del soft-delete del propio periodo, dentro
   * de la misma transacción, para mantener la coherencia entre el origen y los
   * impactos en el calendario de asistencia.
   */
  async destroyForLactationPeriod(
    periodId: number,
    trx?: TransactionClientContract
  ): Promise<{ deletedCount: number }> {
    const now = DateTime.now().toSQL({ includeOffset: false })
    const baseQuery = trx ? ShiftException.query({ client: trx }) : ShiftException.query()
    const deletedCount = await baseQuery
      .where('lactation_period_id', periodId)
      .whereNull('shift_exceptions_deleted_at')
      .update({ shift_exceptions_deleted_at: now })

    // `update` regresa la cantidad afectada (number) o un array según el driver;
    // normalizamos para devolver siempre un entero.
    const normalized = Array.isArray(deletedCount)
      ? Number.parseInt(`${deletedCount[0] ?? 0}`, 10) || 0
      : Number.parseInt(`${deletedCount ?? 0}`, 10) || 0
    return { deletedCount: normalized }
  }

  // ---------------------------------------------------------------------------
  //  Helpers privados (lactancia)
  // ---------------------------------------------------------------------------

  /**
   * Genera las excepciones día a día para el subrango dado. Aísla el cálculo
   * de check-in/out y la persistencia en bulk para que `generate` y `regenerate`
   * compartan la misma implementación.
   */
  private async generateExceptionsForRange(params: {
    period: EmployeeLactationPeriod
    exceptionTypeId: number
    rangeStart: DateTime
    rangeEnd: DateTime
    trx?: TransactionClientContract
  }): Promise<LactationShiftExceptionsResult> {
    const { period, exceptionTypeId, rangeStart, rangeEnd, trx } = params
    const employeeShifts = await this.loadEmployeeShiftsUpTo(period.employeeId, rangeEnd, trx)

    const rows: Array<Partial<ShiftException>> = []
    const omittedDaysWithoutShift: string[] = []

    let current = rangeStart.setZone('UTC-6').startOf('day')
    const end = rangeEnd.setZone('UTC-6').startOf('day')

    while (current <= end) {
      const isoDate = current.toFormat('yyyy-LL-dd')
      const assignment = this.findActiveAssignmentForDate(current, employeeShifts)

      if (!assignment) {
        omittedDaysWithoutShift.push(isoDate)
        current = current.plus({ days: 1 })
        continue
      }
      if (this.isRestDayForShift(current, assignment.shift.shiftRestDays)) {
        current = current.plus({ days: 1 })
        continue
      }

      const times = this.calculateLactationAdjustedTimes(
        assignment.shift,
        period.employeeLactationPeriodType,
        period.employeeLactationPeriodReductionApplication
      )

      rows.push({
        employeeId: period.employeeId,
        exceptionTypeId,
        shiftExceptionsDate: isoDate,
        shiftExceptionsDescription: this.buildLactationDescription(period),
        shiftExceptionCheckInTime: times.checkIn,
        shiftExceptionCheckOutTime: times.checkOut,
        shiftExceptionEnjoymentOfSalary: 1,
        shiftExceptionTimeByTime: 0,
        lactationPeriodId: period.employeeLactationPeriodId,
      })

      current = current.plus({ days: 1 })
    }

    if (rows.length > 0) {
      await ShiftException.createMany(rows, trx ? { client: trx } : undefined)
    }

    if (omittedDaysWithoutShift.length > 0) {
      logger.warn(
        {
          module: 'employee_lactation_period',
          employeeId: period.employeeId,
          lactationPeriodId: period.employeeLactationPeriodId,
          rangeStart: rangeStart.toFormat('yyyy-LL-dd'),
          rangeEnd: rangeEnd.toFormat('yyyy-LL-dd'),
          omittedDaysCount: omittedDaysWithoutShift.length,
        },
        'Se omitieron días sin EmployeeShift activo al generar excepciones de lactancia'
      )
    }

    return {
      lactationPeriodId: period.employeeLactationPeriodId,
      generatedCount: rows.length,
      omittedDaysWithoutShift,
    }
  }

  /**
   * Carga el periodo activo o lanza 404 con código tipado para que el flujo
   * superior responda de forma consistente. No carga el `employee`; quien necesite
   * pertenencia a la empresa debe validarlo aparte (lo hace `EmployeeLactationPeriodService`).
   */
  private async loadLactationPeriodOrThrow(
    periodId: number,
    trx?: TransactionClientContract
  ): Promise<EmployeeLactationPeriod> {
    const baseQuery = trx
      ? EmployeeLactationPeriod.query({ client: trx })
      : EmployeeLactationPeriod.query()
    const period = await baseQuery
      .where('employee_lactation_period_id', periodId)
      .whereNull('employee_lactation_period_deleted_at')
      .first()

    if (!period) {
      throw new EmployeeLactationPeriodError(
        'El periodo de lactancia no existe.',
        ELP_ERROR_CODES.PERIOD_NOT_FOUND,
        404
      )
    }
    return period
  }

  /**
   * Resuelve y cachea ad-hoc el `exceptionTypeId` del slug `lactancia`. Si no
   * existe, lanza error tipado 500 para que la transacción se revierta.
   */
  private async resolveLactationExceptionTypeId(
    trx?: TransactionClientContract
  ): Promise<number> {
    const baseQuery = trx ? ExceptionType.query({ client: trx }) : ExceptionType.query()
    const row = await baseQuery
      .where('exception_type_slug', LACTATION_EXCEPTION_TYPE_SLUG)
      .whereNull('exception_type_deleted_at')
      .select('exceptionTypeId')
      .first()

    if (!row) {
      throw new EmployeeLactationPeriodError(
        'El tipo de excepción de lactancia no está configurado. Ejecuta el seeder correspondiente.',
        ELP_ERROR_CODES.EXCEPTION_TYPE_MISSING,
        500,
        'lactation-exception-type-missing'
      )
    }
    return row.exceptionTypeId
  }

  /**
   * Carga todos los `EmployeeShift` no borrados de la empleada cuyo `applySince`
   * sea anterior o igual al fin del rango. Permite resolver el shift vigente
   * para cualquier día del rango sin hacer N queries.
   */
  private async loadEmployeeShiftsUpTo(
    employeeId: number,
    rangeEnd: DateTime,
    trx?: TransactionClientContract
  ): Promise<LactationActiveAssignment[]> {
    const baseQuery = trx ? EmployeeShift.query({ client: trx }) : EmployeeShift.query()
    const records = await baseQuery
      .where('employee_id', employeeId)
      .whereRaw('DATE(employe_shifts_apply_since) <= ?', [rangeEnd.toFormat('yyyy-LL-dd')])
      .whereNull('deletedAt')
      .preload('shift')
      .orderBy('employeShiftsApplySince', 'desc')

    const assignments: LactationActiveAssignment[] = []
    for (const record of records) {
      const shift = record.shift
      if (!shift) continue
      const shiftTimeStart = `${shift.shiftTimeStart ?? ''}`
      const shiftActiveHours = Number(shift.shiftActiveHours ?? 0)
      const shiftRestDays = `${shift.shiftRestDays ?? ''}`
      if (!shiftTimeStart || !shiftActiveHours) continue

      const applySince = this.toDateTime(record.employeShiftsApplySince).setZone('UTC-6')
      if (!applySince.isValid) continue

      assignments.push({
        applySince,
        shift: { shiftTimeStart, shiftActiveHours, shiftRestDays },
      })
    }
    return assignments
  }

  /**
   * Devuelve el `EmployeeShift` activo para la fecha dada (el de mayor
   * `applySince` que sea anterior o igual a la fecha). `null` si no existe.
   */
  private findActiveAssignmentForDate(
    dayDate: DateTime,
    assignments: LactationActiveAssignment[]
  ): LactationActiveAssignment | null {
    const day = dayDate.setZone('UTC-6').startOf('day')
    for (const a of assignments) {
      // assignments está ordenado por applySince DESC; tomamos el primero compatible
      if (a.applySince.startOf('day') <= day) {
        return a
      }
    }
    return null
  }

  /**
   * Calcula los campos `shiftExceptionCheckInTime` y `shiftExceptionCheckOutTime`
   * según el tipo y la modalidad de aplicación del periodo de lactancia.
   *
   * Hora base: `shift.shiftTimeStart` (acepta `HH:mm` o `HH:mm:ss`).
   * Hora salida normal: `shiftTimeStart + shiftActiveHours`.
   *
   * - `start` ⇒ sólo se modifica entrada (`checkIn`), `checkOut` queda null.
   * - `end` (default) ⇒ sólo se modifica salida (`checkOut`), `checkIn` queda null.
   * - `split` ⇒ se modifican ambos.
   */
  private calculateLactationAdjustedTimes(
    shift: LactationShiftInfo,
    periodType: 'two_rest_periods' | 'reduced_hour',
    application: 'start' | 'end' | 'split'
  ): { checkIn: string | null; checkOut: string | null } {
    const reduction = LACTATION_REDUCTION_MINUTES[periodType]
    const baseStart = this.parseTimeOfDay(shift.shiftTimeStart)
    if (!baseStart) {
      return { checkIn: null, checkOut: null }
    }
    const baseEnd = baseStart.plus({ hours: shift.shiftActiveHours })

    switch (application) {
      case 'start':
        return {
          checkIn: baseStart.plus({ minutes: reduction.full }).toFormat('HH:mm:ss'),
          checkOut: null,
        }
      case 'split':
        return {
          checkIn: baseStart.plus({ minutes: reduction.halfStart }).toFormat('HH:mm:ss'),
          checkOut: baseEnd.minus({ minutes: reduction.halfEnd }).toFormat('HH:mm:ss'),
        }
      case 'end':
      default:
        return {
          checkIn: null,
          checkOut: baseEnd.minus({ minutes: reduction.full }).toFormat('HH:mm:ss'),
        }
    }
  }

  /**
   * Convierte `HH:mm` o `HH:mm:ss` a un `DateTime` neutro (fecha 1970-01-01)
   * en UTC-6 para poder sumarle/restarle minutos sin acarreo de zona horaria.
   */
  private parseTimeOfDay(value: string): DateTime | null {
    if (!value) return null
    const normalized = value.length === 5 ? `${value}:00` : value
    const dt = DateTime.fromISO(`1970-01-01T${normalized}`, { zone: 'UTC-6' })
    return dt.isValid ? dt : null
  }

  /**
   * Convierte cualquier representación de fecha (string, JS Date, Luxon DateTime)
   * a `DateTime` en UTC-6 PRESERVANDO el componente de fecha tal cual fue
   * almacenado en la columna `DATE` de MySQL.
   *
   * Contexto del bug que esta función mitiga:
   *  - `mysql2` decodifica una columna `DATE` como `Date` JS construido con
   *    `new Date('YYYY-MM-DD')`, que es medianoche UTC.
   *  - Lucid `@column.date()` lo envuelve con `DateTime.fromJSDate(date)` SIN
   *    especificar zona, por lo que el `DateTime` resultante queda en la zona
   *    local del proceso (UTC-6 en MX). Visto en local, ese instante es la
   *    medianoche UTC menos 6 h = "ayer 18:00", por lo que `toISODate()`
   *    devuelve el día ANTERIOR al almacenado.
   *  - Solución: convertir explícitamente a UTC antes de extraer el componente
   *    de fecha, recuperando el `YYYY-MM-DD` original.
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
      const direct = DateTime.fromISO(head, { zone: 'UTC-6' })
      if (direct.isValid) return direct
      const sql = DateTime.fromSQL(value, { zone: 'UTC-6' })
      if (sql.isValid) return sql
    }
    return DateTime.invalid('Fecha no parseable para lactancia')
  }

  /**
   * Construye la descripción legible que acompaña cada excepción generada.
   * No expone notas privadas del periodo; sólo el origen y la modalidad.
   */
  private buildLactationDescription(period: EmployeeLactationPeriod): string {
    return `Periodo de lactancia (${period.employeeLactationPeriodType}/${period.employeeLactationPeriodReductionApplication})`
  }

  /**
   * Soft-delete masivo de las excepciones futuras del periodo (fecha >= hoy).
   */
  private async softDeleteFutureExceptionsByPeriod(
    periodId: number,
    today: DateTime,
    trx?: TransactionClientContract
  ): Promise<void> {
    const now = DateTime.now().toSQL({ includeOffset: false })
    const todayIso = today.toFormat('yyyy-LL-dd')
    const baseQuery = trx ? ShiftException.query({ client: trx }) : ShiftException.query()
    await baseQuery
      .where('lactation_period_id', periodId)
      .whereNull('shift_exceptions_deleted_at')
      .whereRaw('DATE(shift_exceptions_date) >= ?', [todayIso])
      .update({ shift_exceptions_deleted_at: now })
  }
}
