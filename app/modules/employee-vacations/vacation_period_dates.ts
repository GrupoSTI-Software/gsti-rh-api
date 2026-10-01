import { DateTime } from 'luxon'

/**
 * Meses entre el fin del periodo y la prescripcion de los dias no gozados.
 *
 * El derecho nace al cumplir el año de servicio, que es el ultimo dia del
 * periodo. Desde ahi el patron tiene seis meses para otorgarlas (LFT art. 81)
 * y el trabajador un año para reclamarlas (LFT art. 516): 18 meses.
 */
export const VACATION_PRESCRIPTION_MONTHS_AFTER_PERIOD = 18

export const VACATION_PERIOD_STATE = {
  /** El periodo todavia corre. */
  CURRENT: 'current',
  /** El periodo termino y aun se pueden gozar o reclamar los dias. */
  EXPIRING: 'expiring',
  /** Los dias no gozados ya prescribieron. */
  EXPIRED: 'expired',
} as const

export type VacationPeriodState = (typeof VACATION_PERIOD_STATE)[keyof typeof VACATION_PERIOD_STATE]

export interface VacationPeriodDates {
  /** Aniversario que abre el periodo (ISO yyyy-MM-dd). */
  periodStartsAt: string
  /** Vispera del siguiente aniversario. */
  periodEndsAt: string
  /** Dia en que prescriben los dias no gozados de este periodo. */
  prescribesAt: string
  state: VacationPeriodState
}

/**
 * Fechas del periodo de vacaciones que abre el aniversario de `year`.
 *
 * Un ingreso en 29 de febrero cae en 28 en los años no bisiestos: luxon ajusta
 * al ultimo dia valido del mes al cambiar el año.
 *
 * @param hireDate Fecha de ingreso del colaborador.
 * @param year Año del aniversario que abre el periodo.
 * @param today Dia contra el que se decide el estado.
 */
export function vacationPeriodDates(
  hireDate: DateTime,
  year: number,
  today: DateTime = DateTime.now()
): VacationPeriodDates {
  const start = hireDate.startOf('day').plus({ years: year - hireDate.year })
  const end = start.plus({ years: 1 }).minus({ days: 1 })
  const prescribes = end.plus({ months: VACATION_PRESCRIPTION_MONTHS_AFTER_PERIOD })
  const day = today.startOf('day')

  const state =
    day <= end
      ? VACATION_PERIOD_STATE.CURRENT
      : day <= prescribes
        ? VACATION_PERIOD_STATE.EXPIRING
        : VACATION_PERIOD_STATE.EXPIRED

  return {
    periodStartsAt: start.toISODate() ?? '',
    periodEndsAt: end.toISODate() ?? '',
    prescribesAt: prescribes.toISODate() ?? '',
    state,
  }
}
