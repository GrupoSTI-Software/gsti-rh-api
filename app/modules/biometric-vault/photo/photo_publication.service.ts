import { DateTime } from 'luxon'
import BiometricPhotoPublication, {
  PHOTO_PUBLICATION_STATUS,
} from '#models/biometric_photo_publication'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import DeviceCommandService from '#modules/device-commands/device_command.service'
import type { DeviceCommandPort } from '#modules/device-commands/device_command_port'
import PhotoPublicationRepositoryMysql from './photo_publication.repository.mysql.js'
import type { PhotoPublicationRepository } from './photo_publication.repository.js'
import { generatePhotoToken, hashPhotoToken } from './photo_token.js'
import { ADMS_PHOTO_PUBLICATION_TTL_HOURS } from './photo.constants.js'

export interface PublishInput {
  businessUnitId: number
  employeeId: number
  accessPointId: number
  accessPointEmployeeId: number
  pin: string
  derivativeVersion: number
  requestedByUserId: number | null
  now: DateTime
}

export interface PublishResult {
  publication: BiometricPhotoPublication
  /** El token en claro. Solo existe aqui y en el payload; no se persiste. */
  token: string
  commandCreated: boolean
}

/** Ruta que el equipo va a pedir. El token es un segmento, nunca el PIN. */
export function photoUrlFor(token: string, pin: string): string {
  return `iclock/doc/biophoto/${token}/${pin}.jpg`
}

/** Llave de idempotencia: una foto viva por PIN y equipo. */
export function photoCorrelationKey(pin: string): string {
  return `biophoto:${pin}`
}

/**
 * Publica la foto hacia un checador (spec ADMS 7.3, decision D1).
 *
 * El aparato no acepta que le empujemos la imagen: hay que darle una URL y que
 * la baje. Como esa peticion llega sin sesion, la URL ES la credencial, y por
 * eso vive poco y se guarda hasheada.
 */
export default class PhotoPublicationService {
  constructor(
    private readonly repository: PhotoPublicationRepository = new PhotoPublicationRepositoryMysql(),
    private readonly commands: DeviceCommandPort = new DeviceCommandService()
  ) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    const token = generatePhotoToken()
    const publication = await this.repository.create({
      businessUnitId: input.businessUnitId,
      employeeId: input.employeeId,
      accessPointId: input.accessPointId,
      tokenHash: hashPhotoToken(token),
      pin: input.pin,
      derivativeVersion: input.derivativeVersion,
      expiresAt: input.now.plus({ hours: ADMS_PHOTO_PUBLICATION_TTL_HOURS }),
      now: input.now,
    })

    const result = await this.commands.enqueue({
      accessPointId: input.accessPointId,
      businessUnitId: input.businessUnitId,
      kind: DEVICE_COMMAND_KIND.BIOPHOTO_WRITE,
      fields: { pin: input.pin, url: photoUrlFor(token, input.pin), bioNo: 9 },
      employeeId: input.employeeId,
      accessPointEmployeeId: input.accessPointEmployeeId,
      biometricPhotoPublicationId: publication.biometricPhotoPublicationId,
      correlationKey: photoCorrelationKey(input.pin),
      requestedByUserId: input.requestedByUserId,
    })

    return { publication, token, commandCreated: result.created }
  }

  /**
   * Retira las publicaciones vivas de un colaborador.
   *
   * Se llama al apagar el uso en dispositivos y al cambiar la foto: mientras
   * una publicacion siga viva, cualquiera con el enlace puede bajar la cara de
   * esa persona, aunque en la pantalla ya diga que no.
   */
  async withdrawForEmployee(employeeId: number, now: DateTime): Promise<number> {
    const live = await this.repository.findLiveByEmployee(employeeId)
    for (const publication of live) {
      publication.biometricPhotoPublicationStatus = PHOTO_PUBLICATION_STATUS.WITHDRAWN
      publication.biometricPhotoPublicationWithdrawnAt = now
      await this.repository.save(publication)
    }
    return live.length
  }

  /**
   * Verdadero si la publicacion sigue sirviendo para descargar.
   *
   * `downloaded` tambien vale: el equipo puede reintentar la descarga y cortarle
   * el segundo intento dejaria la foto a medias sin motivo. Lo que la cierra es
   * el plazo, no el primer uso.
   */
  isDownloadable(publication: BiometricPhotoPublication, now: DateTime): boolean {
    const status = publication.biometricPhotoPublicationStatus
    if (status !== PHOTO_PUBLICATION_STATUS.PUBLISHED && status !== PHOTO_PUBLICATION_STATUS.DOWNLOADED) {
      return false
    }
    return publication.biometricPhotoPublicationExpiresAt > now
  }

  /** Anota la descarga. Nunca lanza: el archivo ya salio hacia el equipo. */
  async markDownloaded(publication: BiometricPhotoPublication, now: DateTime): Promise<void> {
    publication.biometricPhotoPublicationStatus = PHOTO_PUBLICATION_STATUS.DOWNLOADED
    publication.biometricPhotoPublicationDownloadedAt =
      publication.biometricPhotoPublicationDownloadedAt ?? now
    publication.biometricPhotoPublicationDownloadCount += 1
    await this.repository.save(publication)
  }
}
