import type { IncomingFile } from '#services/file_intake_service'

/** Puerto de almacenamiento de los banners de los slides. */
export interface AnnouncementBannerStorage {
  /**
   * Pasa el archivo por el intake (`announcement-banner`) y lo sube privado.
   * Devuelve la llave del objeto.
   *
   * @throws FileIntakeError si el archivo no pasa la política (422) o el
   *         almacenamiento falla (500).
   */
  upload(file: IncomingFile | null): Promise<string>

  /** URL firmada de lectura para `<img src>`; `null` si no se pudo firmar. */
  signedUrl(bannerPath: string): Promise<string | null>
}
