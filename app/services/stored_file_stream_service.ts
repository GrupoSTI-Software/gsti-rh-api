import type { HttpContext } from '@adonisjs/core/http'
import UploadService from '#services/upload_service'
import { isBiometricsPhotoUrl, readEmployeePhotoBuffer } from '#helpers/employee_photo_source'

/**
 * Única vía de salida de archivos del API.
 *
 * Generaliza el patrón que estrenó `employee_biometric_photos_controller`: el
 * cliente pide un RECURSO, nunca una ruta de almacenamiento. La clave del
 * objeto la resuelve el servidor a partir de ese recurso, así que no hay forma
 * de pedir un archivo ajeno manipulando el parámetro — que es exactamente lo
 * que permitía `GET /api/proxy-image`.
 *
 * Los endpoints que la usan viven dentro del grupo con `auth()` y declaran su
 * `permissionGate`; este servicio no decide permisos, solo entrega bytes.
 */
export default class StoredFileStreamService {
  constructor(private readonly uploadService: UploadService = new UploadService()) {}

  /**
   * Escribe el objeto en la respuesta con sus cabeceras de tipo y caché.
   *
   * @param storedPath Referencia guardada en el recurso (key privada o, en
   *                   filas históricas, URL). Nunca llega del cliente.
   * @returns `false` si el objeto no existe; quien llama responde el 404 con el
   *          mensaje propio de su dominio.
   */
  async streamInto(
    ctx: Pick<HttpContext, 'response'>,
    storedPath: string,
    options: { fallbackContentType?: string; maxAgeSeconds?: number } = {}
  ): Promise<boolean> {
    const object = await this.uploadService.streamStoredFile(storedPath)
    if (!object) return false

    const { response } = ctx
    response.header('Content-Type', object.contentType || options.fallbackContentType || 'application/octet-stream')
    response.header('Cache-Control', `private, max-age=${options.maxAgeSeconds ?? 300}`)

    if (object.contentLength !== undefined) {
      response.header('Content-Length', String(object.contentLength))
    }
    if (object.etag) {
      response.header('ETag', object.etag)
    }
    if (object.lastModified) {
      response.header('Last-Modified', object.lastModified.toUTCString())
    }

    response.status(200)
    response.stream(object.stream)
    return true
  }

  /**
   * Variante para la foto de un empleado, que puede vivir en el bucket o en el
   * servidor de biométricos. Se entrega como buffer porque el origen externo no
   * expone un stream que se pueda encadenar con garantías.
   */
  async streamEmployeePhotoInto(
    ctx: Pick<HttpContext, 'response'>,
    storedPath: string,
    options: { maxAgeSeconds?: number } = {}
  ): Promise<boolean> {
    if (!isBiometricsPhotoUrl(storedPath)) {
      return this.streamInto(ctx, storedPath, {
        fallbackContentType: 'image/jpeg',
        maxAgeSeconds: options.maxAgeSeconds,
      })
    }

    const buffer = await readEmployeePhotoBuffer(storedPath)
    if (!buffer) return false

    const { response } = ctx
    response.header('Content-Type', 'image/jpeg')
    response.header('Cache-Control', `private, max-age=${options.maxAgeSeconds ?? 300}`)
    response.header('Content-Length', String(buffer.length))
    response.status(200)
    response.send(buffer)
    return true
  }
}
