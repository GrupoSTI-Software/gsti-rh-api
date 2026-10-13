import type { DateTime } from 'luxon'
import DeviceCommand from '#models/device_command'
import {
  DEVICE_COMMAND_EVIDENCE,
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'

/**
 * Lo unico que la foto necesita de la cola: cerrar el comando cuyo enlace no
 * se pudo servir, y dar por ejecutado el que ya estaba acusado cuando la foto
 * por fin bajo. Se declara como puerto para que la descarga no dependa del
 * repositorio entero de comandos.
 */
export interface PhotoCommandPort {
  failByPublication(publicationId: number, reason: string, now: DateTime): Promise<number>
  /**
   * La descarga es la prueba de entrega de la foto. Si el equipo acuso antes
   * de bajarla, el comando quedo `acked` esperando una prueba que no iba a
   * llegar por contador --una foto de reemplazo no lo mueve--; esta la cierra.
   * Devuelve cuantos cerro.
   */
  executeByPublication(publicationId: number, now: DateTime): Promise<number>
}

export default class PhotoCommandAdapter implements PhotoCommandPort {
  async executeByPublication(publicationId: number, now: DateTime): Promise<number> {
    const commands = await DeviceCommand.query()
      .where('biometric_photo_publication_id', publicationId)
      .where('device_command_kind', DEVICE_COMMAND_KIND.BIOPHOTO_WRITE)
      .where('device_command_status', DEVICE_COMMAND_STATUS.ACKED)

    for (const command of commands) {
      command.deviceCommandStatus = DEVICE_COMMAND_STATUS.EXECUTED
      command.deviceCommandExecutedAt = now
      command.deviceCommandExecutionEvidence = DEVICE_COMMAND_EVIDENCE.PHOTO_DOWNLOADED
      await command.save()
    }
    return commands.length
  }

  /**
   * Marca fallidos los `biophoto_write` de esa publicacion que sigan vivos.
   *
   * Condicionado al estado: si el equipo ya acuso y el comando avanzo, no se
   * pisa. Solo se cierra lo que de verdad seguia esperando.
   */
  async failByPublication(publicationId: number, reason: string, now: DateTime): Promise<number> {
    const commands = await DeviceCommand.query()
      .where('biometric_photo_publication_id', publicationId)
      .where('device_command_kind', DEVICE_COMMAND_KIND.BIOPHOTO_WRITE)
      .whereIn('device_command_status', [
        DEVICE_COMMAND_STATUS.PENDING,
        DEVICE_COMMAND_STATUS.SENT,
        DEVICE_COMMAND_STATUS.ACKED,
      ])

    for (const command of commands) {
      command.deviceCommandStatus = DEVICE_COMMAND_STATUS.FAILED
      command.deviceCommandFailedAt = now
      command.deviceCommandLastError = `photo_download_${reason}`
      await command.save()
    }
    return commands.length
  }
}
