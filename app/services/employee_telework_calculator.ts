import Shift from '#models/shift'
import {
  EMPLOYEE_HYBRID_MODE,
  EMPLOYEE_WORK_SCHEDULE,
  EMPLOYEE_WORK_SCHEDULE_ERROR_CODES,
  EmployeeHybridConfig,
  EmployeeHybridMode,
  EmployeeWorkSchedule,
  EmployeeWorkScheduleErrorCode,
  WEEKS_PER_MONTH_STANDARD,
  isHybridConfigCount,
  isHybridConfigSpecificDays,
} from '#constants/employee_work_schedule'

/**
 * Entrada canónica para el cálculo del porcentaje de teletrabajo.
 * Los tres campos híbridos son opcionales cuando la modalidad no es `Hybrid`.
 */
export interface TeleworkCalculationInput {
  modality: EmployeeWorkSchedule
  hybridMode?: EmployeeHybridMode | null
  hybridConfig?: EmployeeHybridConfig | null
  workingDaysPerWeek: number | null
}

/**
 * Resultado de una validación cruzada de la configuración híbrida.
 * Cuando `ok` es `false`, `code` indica el motivo específico (traducible).
 */
export type HybridValidationResult =
  | { ok: true }
  | { ok: false; code: EmployeeWorkScheduleErrorCode; meta?: Record<string, unknown> }

/**
 * Servicio puro que implementa el cálculo del porcentaje de teletrabajo y las
 * validaciones cruzadas de la modalidad híbrida.
 *
 * Todas sus funciones son estáticas y libres de efectos secundarios; se pueden
 * invocar desde controladores, servicios, seeders y tests sin conexión a BD.
 *
 * Ver `docs/spec-USRH1782788926678.md` §5 y §7.4.
 */
export default class EmployeeTeleworkCalculator {
  /**
   * Deriva la cantidad de días laborables por semana del turno activo del
   * empleado, usando `shiftRestDays` (CSV `"6,7"` de días de descanso en
   * convención ISO 8601: 1 = Lunes, ..., 7 = Domingo). Es la misma convención
   * que emite `components/shiftInfoForm` (frontend) y consume el motor de
   * asistencias (`WEEKDAY(day) + 1` en MySQL).
   *
   * Devuelve `null` cuando no hay turno o el CSV es inválido.
   *
   * @param shift - Turno activo del empleado o `null`.
   * @returns Entero en `[1..7]` con los días laborables, o `null`.
   */
  static resolveWorkingDaysPerWeek(shift: Shift | null | undefined): number | null {
    if (!shift) {
      return null
    }
    const restDays = EmployeeTeleworkCalculator.parseRestDays(shift.shiftRestDays)
    if (restDays === null) {
      return null
    }
    const working = 7 - restDays.length
    if (working < 1 || working > 7) {
      return null
    }
    return working
  }

  /**
   * Parsea el CSV `shiftRestDays` a un arreglo de enteros únicos `[1..7]`.
   *
   * Convención canónica del sistema (ISO 8601 / `MySQL WEEKDAY() + 1`):
   * `1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes, 6 = Sábado, 7 = Domingo`.
   * Esta es la misma convención que usa el formulario canónico de turnos
   * (`components/shiftInfoForm`) y el motor de asistencias
   * (`attendance-stats.repository.mysql.ts` → `WEEKDAY(day) + 1`).
   *
   * Retorna `null` si el string contiene tokens fuera de `[1..7]`, no
   * enteros, o duplicados.
   */
  static parseRestDays(shiftRestDays: string | null | undefined): number[] | null {
    if (!shiftRestDays) {
      return []
    }
    const parts = shiftRestDays
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
    const result: number[] = []
    const seen = new Set<number>()
    // Regex estricta: solo enteros sin signo (rechaza `1.5`, `-1`, `1a`).
    const integerToken = /^\d+$/
    for (const part of parts) {
      if (!integerToken.test(part)) {
        return null
      }
      const value = Number.parseInt(part, 10)
      if (!Number.isInteger(value) || value < 1 || value > 7) {
        return null
      }
      if (seen.has(value)) {
        return null
      }
      seen.add(value)
      result.push(value)
    }
    return result
  }

  /**
   * Valida que la configuración híbrida sea coherente con el modo declarado
   * y con los días laborables del empleado. Aplica las reglas RN-06 a RN-09
   * del spec.
   *
   * @param modality - Modalidad de trabajo del empleado.
   * @param hybridMode - Modo híbrido cuando la modalidad es `Hybrid`.
   * @param hybridConfig - Configuración del modo según su forma canónica.
   * @param workingDaysPerWeek - Días laborables por semana derivados del turno.
   * @param restDays - Días de descanso del turno activo (para RN-07 SpecificDays).
   * @returns `{ ok: true }` si es válida; `{ ok: false, code }` en caso contrario.
   */
  static validateHybridConfig(params: {
    modality: EmployeeWorkSchedule
    hybridMode: EmployeeHybridMode | null | undefined
    hybridConfig: EmployeeHybridConfig | null | undefined
    workingDaysPerWeek: number | null
    restDays?: number[] | null
  }): HybridValidationResult {
    const { modality, hybridMode, hybridConfig, workingDaysPerWeek } = params
    const restDays = params.restDays ?? []

    if (modality !== EMPLOYEE_WORK_SCHEDULE.HYBRID) {
      return { ok: true }
    }

    if (workingDaysPerWeek === null || workingDaysPerWeek < 1) {
      return {
        ok: false,
        code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_REQUIRES_ACTIVE_SHIFT,
      }
    }

    if (!hybridMode) {
      return { ok: false, code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_MODE_REQUIRED }
    }

    if (!hybridConfig) {
      return { ok: false, code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_CONFIG_REQUIRED }
    }

    switch (hybridMode) {
      case EMPLOYEE_HYBRID_MODE.SPECIFIC_DAYS: {
        if (!isHybridConfigSpecificDays(hybridConfig)) {
          return {
            ok: false,
            code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_CONFIG_INVALID_SHAPE,
          }
        }
        const days = hybridConfig.days
        if (!Array.isArray(days) || days.length === 0) {
          return { ok: false, code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_ZERO_EQUALS_ONSITE }
        }
        const uniqueDays = new Set<number>()
        for (const day of days) {
          // Convención ISO: 1 = Lunes, ..., 7 = Domingo (misma del turno).
          if (!Number.isInteger(day) || day < 1 || day > 7) {
            return {
              ok: false,
              code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_CONFIG_INVALID_SHAPE,
            }
          }
          uniqueDays.add(day)
        }
        if (uniqueDays.size !== days.length) {
          return {
            ok: false,
            code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_CONFIG_INVALID_SHAPE,
          }
        }
        const restDaysSet = new Set(restDays)
        for (const day of uniqueDays) {
          if (restDaysSet.has(day)) {
            return {
              ok: false,
              code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_DAYS_INTERSECT_REST_DAYS,
              meta: { day },
            }
          }
        }
        if (uniqueDays.size >= workingDaysPerWeek) {
          return {
            ok: false,
            code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_FULL_EQUALS_REMOTE,
          }
        }
        return { ok: true }
      }

      case EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK: {
        if (!isHybridConfigCount(hybridConfig)) {
          return {
            ok: false,
            code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_CONFIG_INVALID_SHAPE,
          }
        }
        const count = hybridConfig.count
        if (!Number.isInteger(count) || count < 0) {
          return {
            ok: false,
            code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_CONFIG_INVALID_SHAPE,
          }
        }
        if (count === 0) {
          return { ok: false, code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_ZERO_EQUALS_ONSITE }
        }
        if (count >= workingDaysPerWeek) {
          return { ok: false, code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_FULL_EQUALS_REMOTE }
        }
        return { ok: true }
      }

      case EMPLOYEE_HYBRID_MODE.DAYS_PER_MONTH: {
        if (!isHybridConfigCount(hybridConfig)) {
          return {
            ok: false,
            code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_CONFIG_INVALID_SHAPE,
          }
        }
        const count = hybridConfig.count
        if (!Number.isInteger(count) || count < 0) {
          return {
            ok: false,
            code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_CONFIG_INVALID_SHAPE,
          }
        }
        if (count === 0) {
          return { ok: false, code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_ZERO_EQUALS_ONSITE }
        }
        // Spec §5 / RN-07: `1 <= n <= (workingDaysPerWeek * 4.333 - 1)`.
        // Restamos 1 día al total mensual para asegurar que en promedio quede
        // al menos un día presencial. Ej: 5 días × 4.333 = 21.66, max = 20.
        const monthlyWorkingDays = workingDaysPerWeek * WEEKS_PER_MONTH_STANDARD
        const monthlyMaxAllowed = Math.floor(monthlyWorkingDays - 1)
        if (count > monthlyMaxAllowed) {
          return {
            ok: false,
            code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_FULL_EQUALS_REMOTE,
          }
        }
        return { ok: true }
      }

      default:
        return {
          ok: false,
          code: EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_CONFIG_INVALID_SHAPE,
        }
    }
  }

  /**
   * Calcula el porcentaje de teletrabajo del empleado según la modalidad y la
   * configuración híbrida. La entrada debe haber pasado antes por
   * `validateHybridConfig`; si no, el método devuelve `0.00` como fallback
   * seguro (nunca lanza).
   *
   * - `Onsite` → `0.00`
   * - `Remote` → `100.00`
   * - `Hybrid` → derivado del modo y su parámetro, redondeado a 2 decimales.
   *
   * @param input - Datos del empleado necesarios para el cálculo.
   * @returns Número en `[0.00, 100.00]` con dos decimales.
   */
  static calculateTeleworkPercentage(input: TeleworkCalculationInput): number {
    if (input.modality === EMPLOYEE_WORK_SCHEDULE.ONSITE) {
      return 0.0
    }
    if (input.modality === EMPLOYEE_WORK_SCHEDULE.REMOTE) {
      return 100.0
    }
    if (input.modality !== EMPLOYEE_WORK_SCHEDULE.HYBRID) {
      return 0.0
    }
    const workingDays = input.workingDaysPerWeek
    if (!workingDays || workingDays < 1) {
      return 0.0
    }
    if (!input.hybridMode || !input.hybridConfig) {
      return 0.0
    }

    let remoteDays = 0
    let denominator = workingDays

    switch (input.hybridMode) {
      case EMPLOYEE_HYBRID_MODE.SPECIFIC_DAYS: {
        if (!isHybridConfigSpecificDays(input.hybridConfig)) {
          return 0.0
        }
        remoteDays = input.hybridConfig.days.length
        denominator = workingDays
        break
      }
      case EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK: {
        if (!isHybridConfigCount(input.hybridConfig)) {
          return 0.0
        }
        remoteDays = input.hybridConfig.count
        denominator = workingDays
        break
      }
      case EMPLOYEE_HYBRID_MODE.DAYS_PER_MONTH: {
        if (!isHybridConfigCount(input.hybridConfig)) {
          return 0.0
        }
        remoteDays = input.hybridConfig.count
        denominator = workingDays * WEEKS_PER_MONTH_STANDARD
        break
      }
      default:
        return 0.0
    }

    if (denominator <= 0) {
      return 0.0
    }
    const raw = (remoteDays / denominator) * 100
    // Clamp defensivo a [0, 100]: `validateHybridConfig` ya bloquea configs
    // donde `remoteDays >= workingDays` (RN-09 `hybrid_full_equals_remote`),
    // pero si algún flujo legacy invocara este método sin validar primero,
    // preferimos exponer 100.00 a persistir un porcentaje imposible como 140.
    const clamped = Math.min(100, Math.max(0, raw))
    return EmployeeTeleworkCalculator.roundToTwoDecimals(clamped)
  }

  /**
   * Redondea a 2 decimales con "half-away-from-zero" (banking-ish).
   * Se aísla en un helper para que backend y frontend converjan al mismo
   * número; conviene replicar exactamente esta implementación en el composable
   * de UI.
   */
  static roundToTwoDecimals(value: number): number {
    if (!Number.isFinite(value)) {
      return 0.0
    }
    return Math.round((value + Number.EPSILON) * 100) / 100
  }
}
