import type { DateTime } from 'luxon'

/**
 * Lo unico que la evidencia necesita del modulo de avisos: cerrar el aviso
 * "huella sin repartir" cuando una copia de ese template por fin llega a otro
 * equipo. Es un puerto para que el cierre de comandos no dependa del
 * repositorio entero de incidentes.
 */
export interface SpreadNoticePort {
  /** Devuelve cuantos avisos cerro. Nunca lanza: una copia ejecutada no se deshace por un aviso. */
  copyExecuted(biometricTemplateId: number, now: DateTime): Promise<number>
}
