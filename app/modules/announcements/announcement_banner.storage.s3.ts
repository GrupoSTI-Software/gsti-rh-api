import UploadService from '#services/upload_service'
import { FileIntakeError } from '#exceptions/file_intake_error'
import { FILE_INTAKE_ERROR_CODES } from '#constants/file_intake_error_codes'
import type { IncomingFile } from '#services/file_intake_service'
import {
  ANNOUNCEMENT_BANNER_FOLDER,
  ANNOUNCEMENT_BANNER_URL_TTL_SECONDS,
} from './announcements.constants.js'
import type { AnnouncementBannerStorage } from './announcement_banner.storage.js'

/**
 * Banners en el bucket del API vía `UploadService`: privados, firmados al leer.
 *
 * Mismo esquema que las firmas de vacaciones que pinta el BO
 * (`vacation_day_feed.service.ts`): la fila guarda la llave y la respuesta entrega
 * una URL firmada que el `<img src>` carga sin header de auth. Firmar no hace una
 * llamada de red: el SDK calcula la firma localmente.
 */
export default class AnnouncementBannerStorageS3 implements AnnouncementBannerStorage {
  constructor(private readonly uploads: UploadService = new UploadService()) {}

  async upload(file: IncomingFile | null): Promise<string> {
    // `fileUpload` trata el archivo ausente como campo opcional y devuelve un
    // centinela; aquí el banner es el objeto del endpoint, así que es un 422.
    if (!file) {
      throw new FileIntakeError({
        title: 'Archivo no aceptado',
        detail: 'No se recibió ningún archivo en la petición.',
        key: 'archivo-faltante',
        errorCode: FILE_INTAKE_ERROR_CODES.FILE_MISSING,
      })
    }
    return this.uploads.fileUpload(file, 'announcement-banner', ANNOUNCEMENT_BANNER_FOLDER)
  }

  async signedUrl(bannerPath: string): Promise<string | null> {
    const url = await this.uploads.getDownloadLink(bannerPath, ANNOUNCEMENT_BANNER_URL_TTL_SECONDS)
    return typeof url === 'string' ? url : null
  }
}
