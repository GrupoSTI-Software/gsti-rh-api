import type { DateTime } from 'luxon'
import type DeviceCommand from '#models/device_command'

/**
 * Lo que el despacho necesita saber de la foto, sin depender de la boveda.
 *
 * El despachador vive en el modulo de comandos y no tiene por que conocer
 * publicaciones ni tokens: solo pide el payload con el que ese comando debe
 * salir AHORA.
 */
export interface PhotoDispatchPort {
  /**
   * Payload al dia para un `biophoto_write`, o `null` si ese comando ya no
   * debe salir (la publicacion se retiro, la foto se apago).
   */
  refreshForDispatch(command: DeviceCommand, now: DateTime): Promise<string | null>
}
