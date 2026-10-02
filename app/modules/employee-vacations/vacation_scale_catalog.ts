/**
 * Escalas de días de vacaciones de la Ley Federal del Trabajo (art. 76).
 *
 * Son las dos que conviven en el catálogo `vacation_settings`: la anterior a
 * la reforma y la vigente desde el 1 de enero de 2023. Cada período toma la más
 * reciente cuya vigencia ya había iniciado cuando el período abrió.
 *
 * Fuente única de los números que siembra `0021_vacation_setting_seeder`.
 */

/** Desde cuándo aplica la escala anterior: cubre cualquier ingreso histórico. */
export const PRE_REFORM_SCALE_APPLY_SINCE = '1970-01-01'

/** Entrada en vigor de la reforma ("vacaciones dignas"). */
export const REFORM_2023_SCALE_APPLY_SINCE = '2023-01-01'

/** Años de servicio que cubre el catálogo; el validador de captura tope en 50. */
export const VACATION_SCALE_MAX_YEARS = 50

/**
 * Días por año de servicio antes de la reforma: 6, 8, 10 y 12 los primeros
 * cuatro años; a partir del quinto, 14 y dos más por cada cinco años.
 *
 * @param yearsOfService - Años cumplidos (1 en adelante).
 * @returns Días de vacaciones.
 */
export function preReformVacationDays(yearsOfService: number): number {
  if (yearsOfService <= 4) return 4 + yearsOfService * 2
  return 14 + Math.floor((yearsOfService - 5) / 5) * 2
}

/**
 * Días por año de servicio con la reforma 2023: 12, 14, 16, 18 y 20 los
 * primeros cinco años; a partir del sexto, 22 y dos más por cada cinco años.
 *
 * @param yearsOfService - Años cumplidos (1 en adelante).
 * @returns Días de vacaciones.
 */
export function reform2023VacationDays(yearsOfService: number): number {
  if (yearsOfService <= 5) return 10 + yearsOfService * 2
  return 22 + Math.floor((yearsOfService - 6) / 5) * 2
}

/** Fila del catálogo a sembrar. */
export interface VacationScaleRow {
  yearsOfService: number
  vacationDays: number
  applySince: string
}

/**
 * Las dos escalas completas, de 1 a `VACATION_SCALE_MAX_YEARS` años.
 *
 * @returns Una fila por escala y año de servicio.
 */
export function vacationScaleRows(): VacationScaleRow[] {
  const rows: VacationScaleRow[] = []
  for (let years = 1; years <= VACATION_SCALE_MAX_YEARS; years++) {
    rows.push({
      yearsOfService: years,
      vacationDays: preReformVacationDays(years),
      applySince: PRE_REFORM_SCALE_APPLY_SINCE,
    })
    rows.push({
      yearsOfService: years,
      vacationDays: reform2023VacationDays(years),
      applySince: REFORM_2023_SCALE_APPLY_SINCE,
    })
  }
  return rows
}
