import type { DateTime } from 'luxon'
import { PHOTO_PUBLICATION_STATUS } from '#models/biometric_photo_publication'
import type DeviceCommand from '#models/device_command'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import { formatDeviceCommand } from '#modules/device-commands/wire/adms_command_formatter'
import PhotoPublicationRepositoryMysql from './photo_publication.repository.mysql.js'
import type { PhotoPublicationRepository } from './photo_publication.repository.js'
import { generatePhotoToken, hashPhotoToken } from './photo_token.js'
import { photoUrlFor } from './photo_publication.service.js'
import {
  ADMS_PHOTO_DISPATCH_TTL_MINUTES,
  ADMS_PHOTO_PUBLICATION_TTL_HOURS,
} from './photo.constants.js'
import type { PhotoDispatchPort } from './photo_dispatch.port.js'

/**
 * Pone al dia el enlace de la foto justo antes de que salga (spec ADMS 7.3).
 *
 * Un `biophoto_write` puede quedarse horas en la cola -- el equipo estaba
 * apagado, habia otro comando en vuelo -- y para cuando sale, su enlace ya
 * vencio: el aparato pediria la foto y recibiria 404. Aqui se le da uno nuevo.
 *
 * Y en todo caso la ventana se recorta: desde que el enlace viaja por la red
 * del cliente, vive minutos y no horas.
 */
export default class PhotoDispatchService implements PhotoDispatchPort {
  constructor(
    private readonly repository: PhotoPublicationRepository = new PhotoPublicationRepositoryMysql()
  ) {}

  async refreshForDispatch(command: DeviceCommand, now: DateTime): Promise<string | null> {
    if (command.deviceCommandKind !== DEVICE_COMMAND_KIND.BIOPHOTO_WRITE) {
      return command.deviceCommandPayload
    }
    const publicationId = command.biometricPhotoPublicationId
    const pin = command.deviceCommandPin
    if (publicationId === null || pin === null) return command.deviceCommandPayload

    const publication = await this.repository.findById(publicationId)
    /**
     * Retirada quiere decir que una persona apago la foto o la cambio. El
     * comando ya no debe salir: mandarlo escribiria en el equipo una cara que
     * el sistema ya no autoriza.
     */
    if (
      !publication ||
      publication.biometricPhotoPublicationStatus === PHOTO_PUBLICATION_STATUS.WITHDRAWN
    ) {
      return null
    }

    const token = generatePhotoToken()
    publication.biometricPhotoPublicationTokenHash = hashPhotoToken(token)
    publication.biometricPhotoPublicationStatus = PHOTO_PUBLICATION_STATUS.PUBLISHED
    publication.biometricPhotoPublicationDownloadedAt = null
    /**
     * El plazo es el MENOR de los dos: el que le quedaba y el del despacho.
     * Renovar el token no puede alargar la vida de un permiso que ya iba a
     * cerrarse.
     */
    const dispatchDeadline = now.plus({ minutes: ADMS_PHOTO_DISPATCH_TTL_MINUTES })
    const publicationDeadline = publication.biometricPhotoPublicationExpiresAt
    const stillAlive = publicationDeadline > now
    publication.biometricPhotoPublicationExpiresAt = stillAlive
      ? earliestOf(publicationDeadline, dispatchDeadline)
      : /**
         * Ya habia vencido: se re-publica con plazo nuevo, acotado igual al del
         * despacho. Nunca mas de lo que dura una publicacion completa.
         */
        earliestOf(now.plus({ hours: ADMS_PHOTO_PUBLICATION_TTL_HOURS }), dispatchDeadline)
    await this.repository.save(publication)

    return formatDeviceCommand(DEVICE_COMMAND_KIND.BIOPHOTO_WRITE, {
      pin,
      url: photoUrlFor(token, pin),
    })
  }
}

function earliestOf(a: DateTime, b: DateTime): DateTime {
  return a < b ? a : b
}
