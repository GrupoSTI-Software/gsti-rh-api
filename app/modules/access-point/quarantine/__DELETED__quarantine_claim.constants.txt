/**
 * Reclamo de un checador en cuarentena (spec ADMS 9.3).
 */

/** Fallos por empresa antes de frenar, y ventana en minutos. */
export const CLAIM_FAILURES_PER_BUSINESS_UNIT = 5
export const CLAIM_FAILURE_WINDOW_MINUTES = 15

/**
 * Fallos acumulados sobre UNA fila antes de bloquearla.
 *
 * El limite por empresa frena la velocidad; este frena la insistencia. Sin el,
 * quien tenga tiempo puede ir probando series a razon de cinco cada cuarto de
 * hora hasta acertar una: adivinar una serie es adivinar de que empresa es un
 * aparato que esta llamando al servidor.
 */
export const CLAIM_FAILURES_PER_ROW = 5

/**
 * La serie se muestra enmascarada: solo los ultimos cuatro.
 *
 * Quien reclama tiene el aparato delante y puede leer la serie completa de la
 * etiqueta. Mostrarla entera en pantalla convertiria la lista en un catalogo de
 * series validas para quien no lo tiene.
 */
export const QUARANTINE_SERIAL_VISIBLE_CHARS = 4

export function maskSerial(serial: string): string {
  if (serial.length <= QUARANTINE_SERIAL_VISIBLE_CHARS) return '*'.repeat(serial.length)
  const tail = serial.slice(-QUARANTINE_SERIAL_VISIBLE_CHARS)
  return `${'*'.repeat(serial.length - QUARANTINE_SERIAL_VISIBLE_CHARS)}${tail}`
}

/**
 * La IP se recorta a /24: sirve para reconocer "es el aparato de la sucursal
 * norte" sin publicar la direccion exacta de un equipo que aun no es de nadie.
 */
export function maskIp(ip: string): string {
  const parts = ip.split('.')
  if (parts.length !== 4) return 'oculta'
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
}
