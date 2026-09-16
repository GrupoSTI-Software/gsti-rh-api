import env from '#start/env'

/**
 * Retencion del canal de checadores (spec ADMS 13.12).
 *
 * Nada se guarda para siempre y nada se borra sin plazo. Cada valor es
 * configurable pero tiene un MINIMO en codigo: un plazo de un dia puesto por
 * error borraria la evidencia con la que se reconstruye una nomina cuando
 * alguien reclama.
 *
 * Los defaults salen de para que sirve cada cosa:
 *
 * - el crudo es la copia literal de lo que mando el aparato y es lo unico con
 *   lo que se puede reprocesar meses despues: 180 dias;
 * - un crudo `failed` ya se reproceso o se dio por perdido: 30;
 * - los comandos son la bitacora de que se le pidio a cada equipo y quien lo
 *   pidio: un año;
 * - una publicacion retirada ya no sirve para nada y apunta a la cara de una
 *   persona: una semana;
 * - una cuarentena sin actividad es un aparato que dejo de llamar.
 */
export function boundedRetentionDays(
  value: number | undefined,
  fallback: number,
  minimum: number
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.max(minimum, Math.trunc(value))
}

export const ADMS_RAW_RETENTION_MIN_DAYS = 30
export const ADMS_COMMAND_RETENTION_MIN_DAYS = 30
export const ADMS_PHOTO_PUBLICATION_RETENTION_MIN_DAYS = 1
export const ADMS_QUARANTINE_RETENTION_MIN_DAYS = 7

/**
 * Plazos por omision: los que corren en cualquier despliegue que no configure
 * las variables. Son constantes exportadas y no literales sueltos para que el
 * spec pueda anclarse a ELLOS: con el valor escrito dentro de cada funcion,
 * `.env.test` fijaba las cinco variables, la rama del entorno ganaba siempre y
 * el default del codigo no lo cubria ninguna prueba.
 */
export const ADMS_RAW_RETENTION_DEFAULT_DAYS = 180
export const ADMS_RAW_FAILED_RETENTION_DEFAULT_DAYS = 30
export const ADMS_COMMAND_RETENTION_DEFAULT_DAYS = 365
export const ADMS_PHOTO_PUBLICATION_RETENTION_DEFAULT_DAYS = 7
export const ADMS_QUARANTINE_RETENTION_DEFAULT_DAYS = 30

export function admsRawRetentionDays(): number {
  return boundedRetentionDays(
    env.get('ADMS_RAW_RETENTION_DAYS'),
    ADMS_RAW_RETENTION_DEFAULT_DAYS,
    ADMS_RAW_RETENTION_MIN_DAYS
  )
}

export function admsRawFailedRetentionDays(): number {
  return boundedRetentionDays(
    env.get('ADMS_RAW_FAILED_RETENTION_DAYS'),
    ADMS_RAW_FAILED_RETENTION_DEFAULT_DAYS,
    ADMS_RAW_RETENTION_MIN_DAYS
  )
}

export function admsCommandRetentionDays(): number {
  return boundedRetentionDays(
    env.get('ADMS_COMMAND_RETENTION_DAYS'),
    ADMS_COMMAND_RETENTION_DEFAULT_DAYS,
    ADMS_COMMAND_RETENTION_MIN_DAYS
  )
}

export function admsPhotoPublicationRetentionDays(): number {
  return boundedRetentionDays(
    env.get('ADMS_PHOTO_PUBLICATION_RETENTION_DAYS'),
    ADMS_PHOTO_PUBLICATION_RETENTION_DEFAULT_DAYS,
    ADMS_PHOTO_PUBLICATION_RETENTION_MIN_DAYS
  )
}

export function admsQuarantineRetentionDays(): number {
  return boundedRetentionDays(
    env.get('ADMS_QUARANTINE_RETENTION_DAYS'),
    ADMS_QUARANTINE_RETENTION_DEFAULT_DAYS,
    ADMS_QUARANTINE_RETENTION_MIN_DAYS
  )
}

/** Filas por corrida. Purgar en tandas no bloquea la tabla para el canal. */
export const ADMS_PURGE_BATCH_SIZE = 500

/** Igual que arriba, expuesto para que el operador vea con que plazos corre. */
export function admsRetentionSummary(): Record<string, number> {
  return {
    rawDays: admsRawRetentionDays(),
    rawFailedDays: admsRawFailedRetentionDays(),
    commandDays: admsCommandRetentionDays(),
    photoPublicationDays: admsPhotoPublicationRetentionDays(),
    quarantineDays: admsQuarantineRetentionDays(),
  }
}
