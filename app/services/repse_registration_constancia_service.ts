import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import type RepseRegistration from '#models/repse_registration'
import UploadService, { type S3ObjectStream } from '#services/upload_service'
import type { IncomingFile } from '#services/file_intake_service'
import { serializeRepseRegistration } from '#services/repse_registration_service'
import { REPSE_ERROR_CODES } from '../constants/repse_registration_error_codes.js'
import { RepseRegistrationError } from '../exceptions/repse_registration_error.js'
import { findRegistrationInTenantOrFail } from '../helpers/repse_tenant_scope.js'

/** Carpeta lógica de las constancias bajo `{AWS_ROOT_PATH}/`. */
const CONSTANCIA_FOLDER = 'compliance-repse/constancias-repse'

/** Tope de la columna `repse_registration_constancia_file_name`. */
const MAX_FILE_NAME_LENGTH = 255

/**
 * Constancia de registro REPSE (PDF) de un registro del tenant.
 *
 * - Un solo archivo por registro: subir otro lo reemplaza (se sobrescriben
 *   key, nombre y fecha de carga). El objeto anterior se conserva en el
 *   almacenamiento; no se borra.
 * - Todo archivo pasa por `FileIntakeService` con el perfil `pdf-document`
 *   (vía `UploadService.fileUpload`): extensión, magic bytes y tope de 10 MB.
 * - El aislamiento por tenant se hereda de `findRegistrationInTenantOrFail`.
 */
export default class RepseRegistrationConstanciaService {
  constructor(private readonly uploadService: UploadService = new UploadService()) {}

  /** Sube (o reemplaza) la constancia y devuelve el registro serializado. */
  async subir(repseRegistrationId: number, file: IncomingFile | null) {
    const registration = await findRegistrationInTenantOrFail(repseRegistrationId)

    // `fileUpload` trata el archivo ausente como opcional (`file_not_found`);
    // aquí es obligatorio, así que se rechaza antes con la misma key del intake.
    if (!file) {
      throw new RepseRegistrationError(
        "No se recibió el archivo de la constancia en el campo 'archivo'.",
        REPSE_ERROR_CODES.VAL_INPUT,
        422,
        'archivo-faltante'
      )
    }

    const storageKey = await this.uploadService.fileUpload(file, 'pdf-document', CONSTANCIA_FOLDER)

    registration.constanciaStorageKey = storageKey
    registration.constanciaFileName = this.normalizeFileName(file.clientName)
    registration.constanciaUploadedAt = DateTime.now()
    await registration.save()

    logger.info(
      { repseRegistrationId: registration.repseRegistrationId },
      'Constancia de registro REPSE cargada'
    )

    await registration.refresh()
    return serializeRepseRegistration(registration)
  }

  /** Stream del PDF de la constancia para descarga. 404 si no hay constancia. */
  async obtenerStream(repseRegistrationId: number): Promise<{
    registration: RepseRegistration
    object: S3ObjectStream
  }> {
    const registration = await findRegistrationInTenantOrFail(repseRegistrationId)
    if (!registration.constanciaStorageKey) {
      throw this.notFound()
    }

    const object = await this.uploadService.getObjectStream(registration.constanciaStorageKey)
    if (!object) {
      logger.warn(
        { repseRegistrationId },
        'Constancia REPSE registrada en BD pero no encontrada en almacenamiento'
      )
      throw this.notFound()
    }

    return { registration, object }
  }

  private notFound() {
    return new RepseRegistrationError(
      'El registro REPSE no tiene constancia cargada.',
      REPSE_ERROR_CODES.CONSTANCIA_NOT_FOUND,
      404,
      'constancia-no-encontrada'
    )
  }

  private normalizeFileName(clientName: string): string {
    const trimmed = clientName.trim()
    const safe = trimmed.length > 0 ? trimmed : 'constancia-repse.pdf'
    return safe.slice(0, MAX_FILE_NAME_LENGTH)
  }
}
