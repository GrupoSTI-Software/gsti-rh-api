/**
 * Salud del checador (spec ADMS 9.2).
 */

/**
 * Sin latido por mas de esto, el equipo esta caido.
 *
 * El aparato sondea cada pocos segundos, asi que un minuto de silencio ya es
 * anormal. El umbral es corto a proposito: un checador caido son checadas que
 * nadie esta registrando, y enterarse tarde es enterarse cuando ya hay que
 * reconstruir la nomina a mano.
 */
export const ADMS_HEALTH_OFFLINE_THRESHOLD_SECONDS = 60

/** Estado de conexion del equipo. */
export const ADMS_HEALTH_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  /** Registrado pero nunca ha llamado: casi siempre es red o configuracion. */
  NEVER: 'never',
} as const

export type AdmsHealthStatus = (typeof ADMS_HEALTH_STATUS)[keyof typeof ADMS_HEALTH_STATUS]

/**
 * De donde sale la capacidad que se muestra.
 *
 * `declared` la dijo el equipo en `options`; `unknown` es que no la dijo. No se
 * inventa un maximo por modelo: mostrar una capacidad falsa haria que alguien
 * planeara altas que no caben.
 */
export const ADMS_CAPACITY_SOURCE = {
  DECLARED: 'declared',
  UNKNOWN: 'unknown',
} as const

export type AdmsCapacitySource =
  (typeof ADMS_CAPACITY_SOURCE)[keyof typeof ADMS_CAPACITY_SOURCE]

/** Ocupacion a partir de la cual conviene avisar. */
export const ADMS_OCCUPANCY_WARNING_RATIO = 0.85
