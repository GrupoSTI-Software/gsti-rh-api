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

  /**
   * Verdadero si el equipo ya bajo la foto de ese `biophoto_write`.
   *
   * Es la prueba de ejecucion del comando: el aparato descarga la imagen
   * mientras procesa la orden y acusa despues. Un `Return=0` sin descarga es
   * justo el caso que la bateria midio -- acuse limpio y ninguna cara dentro.
   */
  wasDownloaded(command: DeviceCommand): Promise<boolean>
  /**
   * Cierra la publicacion de un comando ya cumplido: el enlace no tiene por que
   * seguir vivo una vez que la foto esta dentro del equipo.
   */
  closeAfterDelivery(command: DeviceCommand, now: DateTime): Promise<void>
}
