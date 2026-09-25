/**
 * Tipos del slice `attendance-time`: la única fuente de verdad sobre cómo se
 * interpreta el tiempo en asistencia (zona del sitio, instantes del turno y
 * buckets de entrada y salida).
 */

/** De dónde salió la zona horaria efectiva de un sitio. */
export type SiteTimeZoneSource = 'access_point' | 'branch_office' | 'business_unit' | 'system'

/** Candidato de zona en la cadena de resolución, en orden de prioridad. */
export interface SiteTimeZoneCandidate {
  zone: string | null | undefined
  source: Exclude<SiteTimeZoneSource, 'system'>
}

/** Zona horaria efectiva de un sitio y cómo se resolvió. */
export interface ResolvedSiteTimeZone {
  /** Identificador IANA válido, p. ej. `America/Ciudad_Juarez`. */
  zone: string
  source: SiteTimeZoneSource
  /**
   * Verdadero cuando algún candidato venía configurado pero no es una zona
   * válida y se tuvo que seguir con el siguiente de la cadena. El llamador
   * decide si levanta un incidente; la resolución nunca falla.
   */
  fellBack: boolean
}

/** Tolerancias de entrada y salida configuradas por la empresa, en minutos. */
export interface AttendanceTolerances {
  /** Hasta este retraso la entrada es tolerancia; después, retardo. */
  delayMinutes: number
  /** Después de este retraso la entrada es falta. */
  faultMinutes: number
}

/** Buckets de la entrada. `fault` cubre llegar muy tarde y no llegar. */
export type CheckInBucket = 'ontime' | 'tolerance' | 'delay' | 'fault'

/**
 * Buckets de la salida. `delay` es la salida anticipada (nombre heredado del
 * modelo de datos, que el resto del sistema ya consume).
 */
export type CheckOutBucket = 'ontime' | 'tolerance' | 'delay'

/** Fila cruda de zonas por empleado que devuelve el repositorio. */
export interface EmployeeSiteTimeZoneRow {
  employeeId: number
  branchOfficeTimezone: string | null
  businessUnitTimezone: string | null
}

/** Zona por empleado ya resuelta, indexada por `employee_id`. */
export type EmployeeSiteTimeZoneMap = Map<number, ResolvedSiteTimeZone>
