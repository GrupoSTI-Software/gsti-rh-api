import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { I18n } from '@adonisjs/i18n'
import Employee from '#models/employee'
import ExceptionRequest from '#models/exception_request'
import ExceptionType from '#models/exception_type'
import EmployeeService from '#services/employee_service'

/** Señal que apoya la decisión de quien resuelve. */
export interface DecisionSignal {
  /** Identificador estable de la señal, para que el front elija su icono. */
  key: string
  /** Gravedad con la que se pinta: informativa o de advertencia. */
  tone: 'info' | 'warning'
  /** Valor numérico que acompaña a la señal, cuando lo hay. */
  value: number | null
}

/** Contexto completo de una solicitud. */
export interface DecisionContext {
  /** Señales disponibles, en el orden en que conviene leerlas. */
  signals: DecisionSignal[]
}

/** Días hacia atrás para contar reincidencia en tipos de jornada. */
const SHIFT_WINDOW_DAYS = 30

/** Días hacia atrás para contar reincidencia en ausencias. */
const ABSENCE_WINDOW_DAYS = 90

/** Slugs de tipo que se miden con la ventana corta. */
const SHIFT_TYPE_SLUGS = [
  'late-arrival',
  'early-departure',
  'leaving-during-work-hours',
  'leaving-without-checkout',
  'start-shift-without-checkin',
]

/**
 * Señales que acompañan a una solicitud al momento de resolverla.
 *
 * Existe porque quien resuelve veía tipo, fecha y descripción, y decidía a
 * ciegas: sin saber si al empleado le quedan vacaciones, si es su tercer
 * retardo del mes o si ya hay medio equipo fuera ese día.
 *
 * Cada señal se calcula por separado y **falla suave**: si una consulta revienta
 * o no tiene datos, las demás se devuelven igual. El contexto apoya la decisión;
 * nunca puede impedir que se tome.
 */
export default class ExceptionRequestDecisionContextService {
  private i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }

  /**
   * Reúne las señales de una solicitud.
   *
   * @param exceptionRequest - Solicitud que se está resolviendo.
   * @param businessUnitId - Empresa activa; acota toda consulta de apoyo.
   * @returns Las señales que se pudieron calcular.
   */
  async build(
    exceptionRequest: ExceptionRequest,
    businessUnitId: number | null
  ): Promise<DecisionContext> {
    const exceptionType = await ExceptionType.query()
      .whereNull('exception_type_deleted_at')
      .where('exception_type_id', exceptionRequest.exceptionTypeId)
      .first()

    const resultados = await Promise.allSettled([
      this.vacationBalance(exceptionRequest, exceptionType),
      this.repeatOffense(exceptionRequest, exceptionType),
      this.weeklyOvertime(exceptionRequest, exceptionType),
      this.teamOverlap(exceptionRequest),
      this.attendanceRecord(exceptionRequest, businessUnitId),
    ])

    const signals = resultados
      .filter(
        (resultado): resultado is PromiseFulfilledResult<DecisionSignal | null> =>
          resultado.status === 'fulfilled'
      )
      .map((resultado) => resultado.value)
      .filter((signal): signal is DecisionSignal => signal !== null)

    for (const resultado of resultados) {
      if (resultado.status === 'rejected') {
        // Una señal que falla no cancela el contexto: se registra y se omite.
        console.error(
          'ExceptionRequestDecisionContextService: una señal no se pudo calcular',
          resultado.reason
        )
      }
    }

    return { signals }
  }

  /**
   * Días de vacaciones que le quedan al empleado.
   *
   * Solo aplica a solicitudes de vacaciones. Se apoya en el cálculo oficial del
   * servicio de empleados en vez de reimplementar la regla de antigüedad.
   */
  private async vacationBalance(
    exceptionRequest: ExceptionRequest,
    exceptionType: ExceptionType | null
  ): Promise<DecisionSignal | null> {
    if (exceptionType?.exceptionTypeSlug !== 'vacation') return null

    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', exceptionRequest.employeeId)
      .first()

    if (!employee) return null

    const employeeService = new EmployeeService(this.i18n)
    const corresponding = await employeeService.getDaysVacationsCorresponing(employee)
    const used = await employeeService.getVacationsUsed(employee)

    const correspondingDays = Number(corresponding ?? 0)
    const usedDays = Number(
      (used as { data?: { vacationsUsedList?: unknown[] } })?.data?.vacationsUsedList?.length ?? 0
    )
    const available = correspondingDays - usedDays

    if (!Number.isFinite(available)) return null

    return {
      key: 'vacation_balance',
      tone: available > 0 ? 'info' : 'warning',
      value: available,
    }
  }

  /**
   * Cuántas veces pidió lo mismo en la ventana que corresponde a su tipo.
   *
   * Los tipos de jornada (retardos, salidas) se miden en 30 días; las ausencias,
   * en 90. Son ritmos distintos: tres retardos en un mes dicen algo, tres faltas
   * en un mes dicen otra cosa.
   */
  private async repeatOffense(
    exceptionRequest: ExceptionRequest,
    exceptionType: ExceptionType | null
  ): Promise<DecisionSignal | null> {
    const slug = exceptionType?.exceptionTypeSlug ?? ''
    const windowDays = SHIFT_TYPE_SLUGS.includes(slug) ? SHIFT_WINDOW_DAYS : ABSENCE_WINDOW_DAYS
    const since = DateTime.now().minus({ days: windowDays }).toSQLDate()

    if (!since) return null

    const rows = await ExceptionRequest.query()
      .whereNull('exception_request_deleted_at')
      .where('employee_id', exceptionRequest.employeeId)
      .where('exception_type_id', exceptionRequest.exceptionTypeId)
      .where('exception_request_status', 'accepted')
      .where('requested_date', '>=', since)
      .count('* as total')

    const total = Number(
      (rows[0] as unknown as { $extras: { total: number } })?.$extras?.total ?? 0
    )

    if (total === 0) return null

    return {
      key: SHIFT_TYPE_SLUGS.includes(slug) ? 'repeat_offense_month' : 'repeat_offense_quarter',
      tone: total >= 3 ? 'warning' : 'info',
      value: total,
    }
  }

  /**
   * Horas extra que el empleado ya acumula en la semana de la fecha pedida.
   *
   * Solo aplica cuando la solicitud declara horas: es el dato que dice si una
   * autorización más rebasa lo razonable.
   */
  private async weeklyOvertime(
    exceptionRequest: ExceptionRequest,
    exceptionType: ExceptionType | null
  ): Promise<DecisionSignal | null> {
    if (exceptionType?.exceptionTypeSlug !== 'overtime') return null

    const requested = exceptionRequest.requestedDate
      ? DateTime.fromJSDate(new Date(exceptionRequest.requestedDate.toString()))
      : null

    if (!requested?.isValid) return null

    const from = requested.startOf('week').toSQLDate()
    const to = requested.endOf('week').toSQLDate()

    if (!from || !to) return null

    const rows = await ExceptionRequest.query()
      .whereNull('exception_request_deleted_at')
      .where('employee_id', exceptionRequest.employeeId)
      .where('exception_request_status', 'accepted')
      .whereBetween('requested_date', [from, to])
      .sum('exception_request_period_in_hours as total')

    const total = Number(
      (rows[0] as unknown as { $extras: { total: number | null } })?.$extras?.total ?? 0
    )

    if (total <= 0) return null

    return { key: 'weekly_overtime', tone: total >= 9 ? 'warning' : 'info', value: total }
  }

  /**
   * Cuántas personas del mismo departamento ya tienen permiso ese día.
   *
   * Viaja como conteo y nunca como nombres: quien resuelve necesita saber si el
   * área se queda sin gente, no el expediente de los demás.
   */
  private async teamOverlap(exceptionRequest: ExceptionRequest): Promise<DecisionSignal | null> {
    const requested = exceptionRequest.requestedDate
      ? DateTime.fromJSDate(new Date(exceptionRequest.requestedDate.toString())).toSQLDate()
      : null

    if (!requested) return null

    const employee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', exceptionRequest.employeeId)
      .first()

    if (!employee?.departmentId) return null

    const rows = await ExceptionRequest.query()
      .whereNull('exception_request_deleted_at')
      .whereNot('exception_request_id', exceptionRequest.exceptionRequestId)
      .where('exception_request_status', 'accepted')
      .where('requested_date', requested)
      .whereHas('employee', (employeeQuery) => {
        employeeQuery.where('department_id', employee.departmentId as number)
      })
      .count('* as total')

    const total = Number(
      (rows[0] as unknown as { $extras: { total: number } })?.$extras?.total ?? 0
    )

    return {
      key: 'team_overlap',
      tone: total >= 2 ? 'warning' : 'info',
      value: total,
    }
  }

  /**
   * Retardos y faltas reales del reloj checador.
   *
   * Se lee `employee_assist_calendar` directo, con una consulta agregada y
   * acotada por empresa. **No** se pasa por `EmployeeAssistsCalendarService`: ese
   * servicio materializa los días que falten del rango y su propio código
   * documenta que ese cálculo superaba el timeout del cliente en una carga fría
   * de un mes. La consecuencia, asumida: se cuenta sobre lo ya materializado, y
   * cuando el periodo no tiene datos la señal no aparece en vez de mentir un cero.
   */
  private async attendanceRecord(
    exceptionRequest: ExceptionRequest,
    businessUnitId: number | null
  ): Promise<DecisionSignal | null> {
    const sinceDelays = DateTime.now().minus({ days: SHIFT_WINDOW_DAYS }).toSQLDate()
    const sinceFaults = DateTime.now().minus({ days: ABSENCE_WINDOW_DAYS }).toSQLDate()

    if (!sinceDelays || !sinceFaults) return null

    const query = db
      .from('employee_assist_calendar')
      .where('employee_id', exceptionRequest.employeeId)
      .where('day', '>=', sinceFaults)

    if (businessUnitId) {
      query.where('business_unit_id', businessUnitId)
    }

    const rows = await query
      .select(
        db.raw(
          'SUM(CASE WHEN check_in_status = \'delay\' AND day >= ? THEN 1 ELSE 0 END) AS delays',
          [sinceDelays]
        ),
        db.raw('SUM(CASE WHEN check_in_status = \'fault\' THEN 1 ELSE 0 END) AS faults'),
        db.raw('COUNT(*) AS materialized_days')
      )

    const row = rows[0] as { delays: number | null; faults: number | null; materialized_days: number } | undefined

    if (!row || Number(row.materialized_days ?? 0) === 0) return null

    const delays = Number(row.delays ?? 0)
    const faults = Number(row.faults ?? 0)

    if (delays === 0 && faults === 0) return null

    return {
      key: 'attendance_record',
      tone: delays >= 3 || faults >= 1 ? 'warning' : 'info',
      value: delays + faults,
    }
  }
}
