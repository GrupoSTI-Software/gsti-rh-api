/**
 * Marca de ubicación de una checada (`assists.assist_location_flag`).
 * VLRH-H1790812613756 — vocabulario cerrado; NULL = sin marca.
 *
 * La decide el servidor tras la comprobación de zona, nunca el cliente: el
 * teléfono sólo declara si su posición fue simulada.
 */
export const ASSIST_LOCATION_FLAG = {
  /** El teléfono reportó la posición como producida por una aplicación de simulación. */
  SIMULATED: 'simulated',
  /** Llegó con ubicación pero sin indicador: la app no lo envía (versión anterior). */
  UNVERIFIED: 'unverified',
} as const

export type AssistLocationFlag = (typeof ASSIST_LOCATION_FLAG)[keyof typeof ASSIST_LOCATION_FLAG]
