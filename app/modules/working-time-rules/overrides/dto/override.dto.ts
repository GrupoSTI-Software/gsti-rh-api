/**
 * DTOs y tipos del submódulo de overrides de jornada por empresa.
 *
 * La API usa camelCase; el mapeo a las columnas de `working_time_rules`
 * (prefijadas) lo hace el service/repository.
 */

/** Cuerpo de creación de un override (POST). */
export interface CreateOverrideInput {
  businessUnitId: number
  effectiveYear: number
  validFrom: string
  validTo: string | null
  maxWeeklyHours: number
  maxWeeklyOvertimeHours: number
  maxDailyOvertimeHours: number
  maxOvertimeDaysPerWeek: number
  dailyHoursDay: number
  dailyHoursNight: number
  dailyHoursMixed: number
  workDaysPerRestDay: number
  exceedsFederalAck: boolean
  overrideJustification: string | null
}

/** Cuerpo de actualización parcial (PATCH). businessUnitId no es editable. */
export type UpdateOverrideInput = Partial<Omit<CreateOverrideInput, 'businessUnitId'>>

/** Topes comparables contra el federal y sujetos al cap de sanidad. */
export interface OverrideCaps {
  maxWeeklyHours: number
  maxWeeklyOvertimeHours: number
  maxDailyOvertimeHours: number
  maxOvertimeDaysPerWeek: number
  dailyHoursDay: number
  dailyHoursNight: number
  dailyHoursMixed: number
  workDaysPerRestDay: number
}
