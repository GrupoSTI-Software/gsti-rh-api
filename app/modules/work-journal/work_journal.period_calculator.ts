import { DateTime } from 'luxon'
import { getBusinessTimeZone } from '#utils/business_date'

/**
 * Calculador del periodo de nómina vencido (núcleo de USRH1782268640950 §11).
 *
 * Decisión de negocio (confirmada con Wilvardo, 2026-07-07): el "fin del
 * periodo de jornada" es el ÚLTIMO DÍA TRABAJADO DEL CICLO, calculado
 * únicamente a partir de `payment_type` + `apply_since` (+ `fixed_day` /
 * `fixed_every_n_weeks` según el tipo). Las banderas de ajuste de
 * `system_setting_payroll_config` (`advance_date_on_weekends`,
 * `advance_date_on_holidays`, `advance_date_in_months_of_31_days`,
 * `number_of_overdue_days_to_offset`) mueven la FECHA DE PAGO, no el rango
 * de días trabajados, y por eso este calculador NO las usa: cerrar la
 * jornada antes de que el último día del ciclo haya ocurrido sellaría un
 * periodo con datos incompletos, algo irreversible dado el diseño
 * write-once de la pieza base (-01).
 *
 * Punto de extensión: si más adelante Wilvardo pide alinear el cierre a la
 * fecha de pago ajustada, se agrega como una función/criterio nuevo detrás
 * de un parámetro explícito en `resolveExpiredPayrollPeriod` — no se
 * implementa ahora porque no hay decisión de negocio que lo respalde.
 *
 * Es lógica pura (sin acceso a BD) para que sea una unidad aislada y
 * testeable, tal como pide el spec.
 */

export type PayrollPaymentType =
  | 'biweekly'
  | 'fourteenth'
  | 'fixed_day_every_n_weeks'
  | 'specific_day_of_month'

/** Subconjunto de `SystemSettingPayrollConfig` que necesita el calculador. */
export interface PayrollPeriodConfig {
  paymentType: PayrollPaymentType
  /** Día del mes en que cierra el ciclo mensual (`specific_day_of_month`). Texto libre en BD; se parsea a entero. */
  fixedDay: string | null
  /** Duración del ciclo en semanas (`fixed_day_every_n_weeks`). */
  fixedEveryNWeeks: number | null
  /** Fecha (ISO) en que esta configuración entró en vigor; ancla de los ciclos catorcenal/semanal. */
  applySince: string
}

export interface ExpiredPayrollPeriod {
  /** Primer día trabajado del ciclo (ISO `YYYY-MM-DD`), inclusive. */
  from: string
  /** Último día trabajado del ciclo (ISO `YYYY-MM-DD`), inclusive. */
  to: string
}

type DateRange = { from: DateTime; to: DateTime }

/** `fixedDay` vive en BD como texto libre y sin validar; null si no es un entero positivo. */
function parseFixedDay(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * Mensual: el ciclo termina en `fixedDay` del mes (clamp al último día si el
 * mes tiene menos días, p. ej. `fixedDay=31` en febrero). Sin `fixedDay`,
 * equivale a "fin de mes".
 */
function resolveSpecificDayOfMonthPeriod(
  cutoff: DateTime,
  fixedDay: number | null
): DateRange | null {
  const daysThisMonth = cutoff.daysInMonth as number
  const endDay = fixedDay !== null ? Math.min(fixedDay, daysThisMonth) : daysThisMonth
  if (cutoff.day !== endDay) {
    return null
  }

  const prevMonth = cutoff.minus({ months: 1 })
  const daysPrevMonth = prevMonth.daysInMonth as number
  const prevEndDay = fixedDay !== null ? Math.min(fixedDay, daysPrevMonth) : daysPrevMonth
  const from = prevMonth.set({ day: prevEndDay }).plus({ days: 1 })

  return { from, to: cutoff }
}

/** Quincenal: periodos fijos 1–15 y 16–fin de mes. No usa `fixedDay`. */
function resolveBiweeklyPeriod(cutoff: DateTime): DateRange | null {
  const daysThisMonth = cutoff.daysInMonth as number
  if (cutoff.day === 15) {
    return { from: cutoff.set({ day: 1 }), to: cutoff }
  }
  if (cutoff.day === daysThisMonth) {
    return { from: cutoff.set({ day: 16 }), to: cutoff }
  }
  return null
}

/**
 * Catorcenal / semanal-cada-N-semanas: bloques de `blockLengthDays` días
 * anclados en `applySince` (bloque 0 = `[applySince, applySince + N - 1]`).
 * El primer ciclo nunca es parcial: arranca completo justo en `applySince`.
 */
function resolveAnchoredBlockPeriod(
  cutoff: DateTime,
  applySince: DateTime,
  blockLengthDays: number
): DateRange | null {
  if (blockLengthDays <= 0 || cutoff < applySince) {
    return null
  }

  const daysSinceAnchor = Math.floor(cutoff.diff(applySince, 'days').days)
  const blockIndex = Math.floor(daysSinceAnchor / blockLengthDays)
  const blockStart = applySince.plus({ days: blockIndex * blockLengthDays })
  const blockEnd = blockStart.plus({ days: blockLengthDays - 1 })

  if (!cutoff.hasSame(blockEnd, 'day')) {
    return null
  }

  return { from: blockStart, to: blockEnd }
}

/**
 * Determina si, para `config`, `cutoffDateIso` es el último día de un
 * periodo de nómina vencido y, de ser así, devuelve su rango `[from, to]`.
 * Devuelve `null` cuando ese día no cierra ningún ciclo para este
 * `payment_type`, cuando las fechas son inválidas, o cuando el ciclo
 * resultante terminó antes de que la configuración entrara en vigor
 * (`applySince`).
 */
export function resolveExpiredPayrollPeriod(
  config: PayrollPeriodConfig,
  cutoffDateIso: string
): ExpiredPayrollPeriod | null {
  const zone = getBusinessTimeZone()
  const cutoff = DateTime.fromISO(cutoffDateIso, { zone }).startOf('day')
  if (!cutoff.isValid) {
    return null
  }

  const applySince = DateTime.fromISO(String(config.applySince), { zone }).startOf('day')
  if (!applySince.isValid) {
    return null
  }

  let cycle: DateRange | null
  switch (config.paymentType) {
    case 'specific_day_of_month':
      cycle = resolveSpecificDayOfMonthPeriod(cutoff, parseFixedDay(config.fixedDay))
      break
    case 'biweekly':
      cycle = resolveBiweeklyPeriod(cutoff)
      break
    case 'fourteenth':
      cycle = resolveAnchoredBlockPeriod(cutoff, applySince, 14)
      break
    case 'fixed_day_every_n_weeks':
      cycle = resolveAnchoredBlockPeriod(cutoff, applySince, (config.fixedEveryNWeeks ?? 1) * 7)
      break
    default:
      return null
  }

  if (!cycle || cycle.to < applySince) {
    return null
  }

  return { from: cycle.from.toISODate() as string, to: cycle.to.toISODate() as string }
}
