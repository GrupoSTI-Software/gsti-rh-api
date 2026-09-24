import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { contentDisposition } from '#helpers/download_file_name'
import { respondAssetsModuleError } from './assets.error.js'
import AssetsService, { type AssetFile } from './assets.service.js'
import { fileIdParamsValidator, photoIdParamsValidator } from './validators/assets.validator.js'

/**
 * Descargas de la ficha del activo: responsiva y fotos de un resguardo. Se
 * transmiten desde el almacenamiento privado (`UploadService.streamStoredFile`)
 * sin exponer su ubicación, igual que los contratos de empleado y la Matriz.
 * Un registro inexistente, de otra empresa o sin archivo responde el mismo 404.
 */
@inject()
export default class AssetFilesController {
  constructor(private readonly service: AssetsService) {}

  /**
   * @swagger
   * /api/employee-supplies-response-contracts/{id}/file:
   *   get:
   *     summary: Archivo de la responsiva de un resguardo
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *       - { in: path, name: id, required: true, schema: { type: integer } }
   *     responses:
   *       '200': { description: "Stream binario (`Content-Disposition: inline`)." }
   *       '403': { description: "Sin `supplies:read` (gate)." }
   *       '404':
   *         description: "`key: archivo-no-encontrado` (inexistente, de otra empresa o sin archivo)."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   */
  async responseContract(ctx: HttpContext) {
    try {
      const { id } = await fileIdParamsValidator.validate(ctx.params)
      return this.send(ctx, await this.service.responseContractFile(id))
    } catch (error) {
      return respondAssetsModuleError(ctx, error)
    }
  }

  /**
   * @swagger
   * /api/employee-supply-assignation-photos/photo/{photoId}/file:
   *   get:
   *     summary: Archivo de una foto de asignación o devolución
   *     tags: [Assets]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - { in: header, name: X-Business-Unit-Id, required: true, schema: { type: string } }
   *       - { in: path, name: photoId, required: true, schema: { type: integer } }
   *     responses:
   *       '200': { description: "Stream binario (`Content-Disposition: inline`)." }
   *       '403': { description: "Sin `supplies:read` (gate)." }
   *       '404':
   *         description: "`key: archivo-no-encontrado` (inexistente, de otra empresa o sin archivo)."
   *         content: { application/json: { schema: { $ref: '#/components/schemas/AssetError' } } }
   */
  async assignationPhoto(ctx: HttpContext) {
    try {
      const { photoId } = await photoIdParamsValidator.validate(ctx.params)
      return this.send(ctx, await this.service.assignationPhotoFile(photoId))
    } catch (error) {
      return respondAssetsModuleError(ctx, error)
    }
  }

  private send({ response }: HttpContext, { object, fileName }: AssetFile) {
    response.header('Content-Type', object.contentType || 'application/octet-stream')
    response.header('Content-Disposition', contentDisposition(fileName, 'inline'))
    response.header('Cache-Control', 'private, no-store')
    if (object.contentLength !== undefined) {
      response.header('Content-Length', String(object.contentLength))
    }
    response.status(200)
    return response.stream(object.stream)
  }
}
