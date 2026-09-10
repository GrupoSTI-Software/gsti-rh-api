import type { DateTime } from 'luxon'
import type { Readable } from 'node:stream'
import AccessPoint from '#models/access_point'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import UploadService from '#services/upload_service'
import { TenantContext } from '#utils/tenant_context'
import PhotoPublicationRepositoryMysql from './photo_publication.repository.mysql.js'
import type { PhotoPublicationRepository } from './photo_publication.repository.js'
import PhotoPublicationService from './photo_publication.service.js'
import { extractPhotoToken, hashPhotoToken } from './photo_token.js'
import logger from '@adonisjs/core/services/logger'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { ADMS_INCIDENT_KIND } from '#modules/adms/adms.constants'
import IncidentService from '#modules/adms/raw/incident.service'
import PhotoCommandAdapter, { type PhotoCommandPort } from './photo_command.adapter.js'

export type PhotoDownloadOutcome =
  | {
      kind: 'ok'
      stream: Readable
      contentLength: number | null
      employeeId: number
      accessPointId: number
      businessUnitId: number
      publicationId: number
    }
  | { kind: 'not_found'; reason: string; publicationId: number | null; accessPointId: number | null }

/**
 * Entrega la foto al checador (spec ADMS 7.3, decision D1).
 *
 * Esta peticion no trae sesion: el aparato no sabe autenticarse. El token es la
 * unica credencial, asi que TODO lo que no sea un token vivo y con publicacion
 * valida responde 404 -- nunca 401 ni 403, que le dirian a quien pruebe rutas
 * que ahi hubo algo.
 *
 * Ninguna respuesta distingue "token mal formado" de "token vencido" de "foto
 * borrada": desde fuera se ven exactamente iguales.
 */
export default class PhotoDownloadService {
  constructor(
    private readonly repository: PhotoPublicationRepository = new PhotoPublicationRepositoryMysql(),
    private readonly publications: PhotoPublicationService = new PhotoPublicationService(),
    private readonly uploads: UploadService = new UploadService(),
    private readonly incidents: IncidentService = new IncidentService(),
    private readonly commands: PhotoCommandPort = new PhotoCommandAdapter()
  ) {}

  /**
   * Deja constancia de que el equipo pidio una foto y no se le pudo dar.
   *
   * El comando asociado se marca fallido SIN esperar al `Return` del aparato:
   * el equipo no avisa de que la descarga le salio mal, asi que sin esto ese
   * comando se quedaria en vuelo hasta que el barrido lo cerrara media hora
   * despues, con un motivo que no explica nada.
   *
   * No lanza: la respuesta 404 ya salio y este es el registro, no la operacion.
   */
  async reportFailedDownload(
    publicationId: number,
    reason: string,
    now: DateTime
  ): Promise<void> {
    try {
      const publication = await this.repository.findByIdUnscoped(publicationId)
      if (!publication) return

      await TenantContext.run([publication.businessUnitId], async () => {
        const accessPoint = await AccessPoint.query()
          .where('access_point_id', publication.accessPointId)
          .first()
        await this.incidents.record({
          kind: ADMS_INCIDENT_KIND.PHOTO_DOWNLOAD_FAILED,
          severity: 'error',
          code: ADMS_ERROR_CODES.PHOTO_NOT_FOUND,
          title: 'El equipo pidio una foto y no se le pudo dar',
          detail:
            'La descarga se rechazo. El colaborador se queda sin rostro en ese equipo hasta que se vuelva a publicar.',
          key: 'foto-no-entregada',
          serial: accessPoint?.accessPointSerialNumber ?? null,
          accessPointId: publication.accessPointId,
          businessUnitId: publication.businessUnitId,
          context: { reason },
          now,
        })
        await this.commands.failByPublication(publicationId, reason, now)
      })
    } catch (error) {
      logger.warn(
        { publicationId, error: (error as Error).message.slice(0, 200) },
        'canal ADMS: no se pudo registrar el fallo de descarga de foto'
      )
    }
  }

  async resolve(path: string, now: DateTime): Promise<PhotoDownloadOutcome> {
    const token = extractPhotoToken(path)
    /**
     * La forma se comprueba antes de tocar la base: probar rutas al azar no
     * puede costar una consulta cada vez.
     */
    if (token === null) {
      return { kind: 'not_found', reason: 'token_malformed', publicationId: null, accessPointId: null }
    }

    const publication = await this.repository.findByTokenHashUnscoped(hashPhotoToken(token))
    if (!publication) {
      return { kind: 'not_found', reason: 'token_unknown', publicationId: null, accessPointId: null }
    }

    if (!this.publications.isDownloadable(publication, now)) {
      return {
        kind: 'not_found',
        reason: 'publication_not_live',
        publicationId: publication.biometricPhotoPublicationId,
        accessPointId: publication.accessPointId,
      }
    }

    /**
     * La empresa sale de la fila y con ella se abre el scope: de aqui en
     * adelante todo corre dentro del corte, incluida la lectura de la foto
     * (regla 13.2).
     */
    return TenantContext.run([publication.businessUnitId], async () => {
      const faceId = await EmployeeBiometricFaceId.query()
        .where('employee_id', publication.employeeId)
        .whereNull('employee_biometric_face_id_deleted_at')
        .first()

      const key = faceId?.employeeBiometricFaceIdDerivativeKey ?? null
      const flagOn = faceId?.employeeBiometricFaceIdDeviceUse === true
      /**
       * El interruptor se comprueba AQUI y no solo al publicar: entre publicar
       * y descargar, alguien pudo apagar el uso en dispositivos, y la foto no
       * puede seguir saliendo porque la publicacion ya estuviera hecha.
       */
      if (!faceId || !flagOn || key === null) {
        return {
          kind: 'not_found' as const,
          reason: 'derivative_missing',
          publicationId: publication.biometricPhotoPublicationId,
          accessPointId: publication.accessPointId,
        }
      }

      const object = await this.uploads.getObjectStream(key)
      if (!object) {
        return {
          kind: 'not_found' as const,
          reason: 'object_missing',
          publicationId: publication.biometricPhotoPublicationId,
          accessPointId: publication.accessPointId,
        }
      }

      await this.publications.markDownloaded(publication, now)

      return {
        kind: 'ok' as const,
        stream: object.stream,
        contentLength: object.contentLength ?? null,
        employeeId: publication.employeeId,
        accessPointId: publication.accessPointId,
        businessUnitId: publication.businessUnitId,
        publicationId: publication.biometricPhotoPublicationId,
      }
    })
  }
}
