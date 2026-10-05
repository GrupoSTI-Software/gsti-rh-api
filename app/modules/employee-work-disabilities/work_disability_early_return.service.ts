import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import ShiftException from '#models/shift_exception'
import type WorkDisability from '#models/work_disability'
import WorkDisabilityPeriod from '#models/work_disability_period'
import { WORK_DISABILITY_ERROR_CODES } from '#constants/work_disability_error_codes'
import { assertDayWithinRoleScope } from '#modules/role-scope/day_scope_guard'
import WorkDisabilityPeriodService from '#services/work_disability_period_service'
import type { WorkDisabilityRejection } from './work_disability_registration.service.js'
import { toIsoDay, workDisabilityDays } from './work_disability_rules.js'

export type EarlyReturnResult =
  | { ok: true; lastCoveredDay: string; removedDays: number }
  | { ok: false; rejection: WorkDisabilityRejection }

export interface EarlyReturnInput {
  ctx: HttpContext
  workDisability: WorkDisability
  /** Primer día que el colaborador vuelve a trabajar, yyyy-MM-dd. */
  returnDate: string
}

/**
 * Regreso anticipado: el colaborador vuelve antes del último día amparado.
 *
 * El último día amparado pasa a ser la víspera del regreso. Los periodos que
 * empiezan el día del regreso o después se retiran completos; el que lo
 * contiene se recorta. En los dos casos se retiran las excepciones de turno de
 * los días que ya no aplican y se recalcula la asistencia.
 *
 * El periodo inicial nunca se retira: el regreso tiene que caer después de su
 * primer día.
 */
export default class WorkDisabilityEarlyReturnService {
  async register(input: EarlyReturnInput): Promise<EarlyReturnResult> {
    const { workDisability, returnDate } = input
    const periods = await WorkDisabilityPeriod.query()
      .whereNull('work_disability_period_deleted_at')
      .where('work_disability_id', workDisability.workDisabilityId)
      .orderBy('work_disability_period_start_date', 'asc')
    if (periods.length === 0) return this.outOfRange()

    const startDate = toIsoDay(periods[0].workDisabilityPeriodStartDate)
    const endDate = periods
      .map((period) => toIsoDay(period.workDisabilityPeriodEndDate))
      .reduce((last, day) => (day > last ? day : last))
    if (returnDate <= startDate || returnDate > endDate) return this.outOfRange()

    const scope = await assertDayWithinRoleScope({
      user: input.ctx.auth.user,
      employeeId: workDisability.employeeId,
      day: returnDate,
      i18n: input.ctx.i18n,
    })
    if (scope) return { ok: false, rejection: scope }

    const lastCoveredDay = DateTime.fromISO(returnDate).minus({ days: 1 }).toISODate()!
    const now = DateTime.now()

    await db.transaction(async (trx) => {
      for (const period of periods) {
        const periodStart = toIsoDay(period.workDisabilityPeriodStartDate)
        const periodEnd = toIsoDay(period.workDisabilityPeriodEndDate)
        if (periodEnd < returnDate) continue

        period.useTransaction(trx)
        if (periodStart >= returnDate) {
          await period.delete()
        } else {
          period.workDisabilityPeriodEndDate = lastCoveredDay
          await period.save()
        }

        // Las excepciones de los días que ya no amparan dejan de contar como falta
        // por incapacidad; la asistencia se recalcula al final.
        await ShiftException.query({ client: trx })
          .whereNull('shift_exceptions_deleted_at')
          .where('work_disability_period_id', period.workDisabilityPeriodId)
          .where('shift_exceptions_date', '>=', returnDate)
          .update({ shift_exceptions_deleted_at: now.toSQL({ includeOffset: false }) })
      }
    })

    await new WorkDisabilityPeriodService(input.ctx.i18n).updateAssistCalendar(
      workDisability.employeeId,
      new Date(returnDate),
      new Date(endDate)
    )

    return {
      ok: true,
      lastCoveredDay,
      removedDays: workDisabilityDays(returnDate, endDate),
    }
  }

  private outOfRange(): EarlyReturnResult {
    return {
      ok: false,
      rejection: {
        status: 422,
        body: {
          type: 'warning',
          title: 'Fecha de regreso fuera de rango',
          detail:
            'El regreso tiene que ser después del primer día de la incapacidad y a más tardar su último día amparado.',
          key: 'regreso-fuera-de-rango',
          code: WORK_DISABILITY_ERROR_CODES.RETURN_OUT_OF_RANGE,
        },
      },
    }
  }
}
