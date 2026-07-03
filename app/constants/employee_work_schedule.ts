/**
 * Catálogo canónico de la modalidad de trabajo del empleado y su
 * configuración de híbrido.
 *
 * Este archivo es la única fuente de verdad de los strings que persisten
 * en la columna `employee_work_schedule` y en los campos derivados. Todo
 * lugar del código (validador, servicio, controller, importación Excel,
 * factories, seeders) debe consumir estas constantes en lugar de repetir
 * literales.
 *
 * Ver `docs/spec-USRH1782788926678.md` §6 y §7.2.
 */

export const EMPLOYEE_WORK_SCHEDULE = {
  ONSITE: 'Onsite',
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
} as const

export type EmployeeWorkSchedule =
  (typeof EMPLOYEE_WORK_SCHEDULE)[keyof typeof EMPLOYEE_WORK_SCHEDULE]

export const EMPLOYEE_WORK_SCHEDULE_VALUES: readonly EmployeeWorkSchedule[] = [
  EMPLOYEE_WORK_SCHEDULE.ONSITE,
  EMPLOYEE_WORK_SCHEDULE.REMOTE,
  EMPLOYEE_WORK_SCHEDULE.HYBRID,
]

export const EMPLOYEE_HYBRID_MODE = {
  SPECIFIC_DAYS: 'SpecificDays',
  DAYS_PER_WEEK: 'DaysPerWeek',
  DAYS_PER_MONTH: 'DaysPerMonth',
} as const

export type EmployeeHybridMode =
  (typeof EMPLOYEE_HYBRID_MODE)[keyof typeof EMPLOYEE_HYBRID_MODE]

export const EMPLOYEE_HYBRID_MODE_VALUES: readonly EmployeeHybridMode[] = [
  EMPLOYEE_HYBRID_MODE.SPECIFIC_DAYS,
  EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK,
  EMPLOYEE_HYBRID_MODE.DAYS_PER_MONTH,
]

/**
 * Forma canónica del `employee_work_schedule_hybrid_config` según el modo:
 * - `SpecificDays` → `{ days: number[] }` (enteros [0..6], 0 = domingo).
 * - `DaysPerWeek` / `DaysPerMonth` → `{ count: number }` (entero positivo).
 */
export interface EmployeeHybridConfigSpecificDays {
  days: number[]
}

export interface EmployeeHybridConfigCount {
  count: number
}

export type EmployeeHybridConfig =
  | EmployeeHybridConfigSpecificDays
  | EmployeeHybridConfigCount

/**
 * Estándar acordado para normalizar días laborables a un mes:
 * 52 semanas / 12 meses ≈ 4.3333 semanas por mes.
 * Se usa como denominador del modo `DaysPerMonth`.
 */
export const WEEKS_PER_MONTH_STANDARD = 52 / 12

/**
 * Umbral de la NOM-037: superar el 40% (estrictamente) califica al
 * empleado como teletrabajador para el listado obligatorio 5.1.
 */
export const TELEWORK_LEGAL_THRESHOLD_PERCENT = 40

/**
 * Códigos de error que puede retornar el validador de modalidad híbrida
 * y el cálculo del porcentaje de teletrabajo. Se referencian desde:
 * - Servicio `EmployeeService` (create/update).
 * - Servicio `EmployeeTeleworkCalculator`.
 * - Traducciones `resources/langs/{es,en}.json` bajo `employee.work_schedule.*`.
 */
export const EMPLOYEE_WORK_SCHEDULE_ERROR_CODES = {
  HYBRID_REQUIRES_ACTIVE_SHIFT: 'hybrid_requires_active_shift',
  HYBRID_DAYS_INTERSECT_REST_DAYS: 'hybrid_days_intersect_rest_days',
  HYBRID_ZERO_EQUALS_ONSITE: 'hybrid_zero_equals_onsite',
  HYBRID_FULL_EQUALS_REMOTE: 'hybrid_full_equals_remote',
  HYBRID_CONFIG_OUT_OF_RANGE: 'hybrid_config_out_of_range',
  HYBRID_MODE_REQUIRED: 'hybrid_mode_required',
  HYBRID_CONFIG_REQUIRED: 'hybrid_config_required',
  HYBRID_CONFIG_INVALID_SHAPE: 'hybrid_config_invalid_shape',
} as const

export type EmployeeWorkScheduleErrorCode =
  (typeof EMPLOYEE_WORK_SCHEDULE_ERROR_CODES)[keyof typeof EMPLOYEE_WORK_SCHEDULE_ERROR_CODES]

/**
 * Type guards útiles para trabajar con la unión discriminada del config.
 */
export function isHybridConfigSpecificDays(
  value: EmployeeHybridConfig | null | undefined
): value is EmployeeHybridConfigSpecificDays {
  return !!value && Array.isArray((value as EmployeeHybridConfigSpecificDays).days)
}

export function isHybridConfigCount(
  value: EmployeeHybridConfig | null | undefined
): value is EmployeeHybridConfigCount {
  return !!value && typeof (value as EmployeeHybridConfigCount).count === 'number'
}
