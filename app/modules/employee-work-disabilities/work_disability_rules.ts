import { DateTime } from 'luxon'

/** Tope de días amparados por un solo periodo (el prototipo no deja pasar de 90). */
export const WORK_DISABILITY_MAX_DAYS = 90

/** Folio del IMSS: dos letras y seis dígitos (SB123456). */
export const WORK_DISABILITY_FOLIO_PATTERN = /^[A-Z]{2}\d{6}$/

/** Cobertura cuyo folio es opcional: la incapacidad interna no la expide el IMSS. */
export const INTERNAL_COVERAGE_SLUG = 'incapacidad-interna'

/** Tipo del periodo con el que nace una incapacidad. */
export const INITIAL_PERIOD_TYPE_SLUG = 'inicial'

/** Tipos admitidos para una ampliación. */
export const EXTENSION_PERIOD_TYPE_SLUGS = ['subsecuente', 'recaida', 'enlace'] as const

/**
 * Último día amparado: el primero cuenta como día 1.
 *
 * @param startDate - Primer día, `yyyy-MM-dd`.
 * @param days - Días amparados (1 en adelante).
 * @returns Último día, `yyyy-MM-dd`.
 */
export function workDisabilityEndDate(startDate: string, days: number): string {
  return DateTime.fromISO(startDate)
    .plus({ days: Math.max(1, days) - 1 })
    .toISODate()!
}

/**
 * Días naturales de un rango, ambos extremos incluidos.
 *
 * @param startDate - Primer día, `yyyy-MM-dd`.
 * @param endDate - Último día, `yyyy-MM-dd`.
 */
export function workDisabilityDays(startDate: string, endDate: string): number {
  const days = DateTime.fromISO(endDate).diff(DateTime.fromISO(startDate), 'days').days
  return Math.round(days) + 1
}

/**
 * Si el folio es aceptable para la cobertura: obligatorio con formato del IMSS,
 * salvo en la incapacidad interna, donde puede omitirse.
 *
 * @param folio - Folio capturado, ya normalizado a mayúsculas.
 * @param coverageSlug - Slug de la cobertura de la incapacidad.
 */
export function isWorkDisabilityFolioValid(folio: string | null, coverageSlug: string): boolean {
  if (!folio) return coverageSlug === INTERNAL_COVERAGE_SLUG
  return WORK_DISABILITY_FOLIO_PATTERN.test(folio)
}

/**
 * Fecha de BD (`Date`, ISO o `yyyy-MM-dd`) como `yyyy-MM-dd`.
 *
 * El driver arma las columnas `date` como `Date` a medianoche de la zona del
 * servidor: se leen en esa misma zona para no correrlas un día.
 */
export function toIsoDay(value: unknown): string {
  if (value instanceof Date) return DateTime.fromJSDate(value).toISODate() ?? ''
  if (DateTime.isDateTime(value)) return value.toISODate() ?? ''
  return String(value ?? '').slice(0, 10)
}
