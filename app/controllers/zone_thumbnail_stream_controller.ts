import type { HttpContext } from '@adonisjs/core/http'
import Zone from '#models/zone'
import StoredFileStreamService from '#services/stored_file_stream_service'

/**
 * Salida de la miniatura del mapa de una zona.
 *
 * Mismo contrato que la foto de perfil (`employee_photo_stream_controller`):
 * el cliente pide una zona y el servidor resuelve la referencia del archivo
 * desde el registro; la ruta de almacenamiento nunca viaja en la petición. La
 * miniatura se guarda como objeto privado (perfil `profile-photo`), así que
 * esta es la forma de mostrarla en el backoffice.
 *
 * El aislamiento por empresa lo pone el mixin de `Zone` con el TenantContext
 * que deja `businessScope()` en el grupo de rutas.
 */
export default class ZoneThumbnailStreamController {
  /**
   * @swagger
   * /api/zones/{zoneId}/thumbnail:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Zones
   *     summary: Miniatura del mapa de la zona
   *     parameters:
   *       - in: path
   *         name: zoneId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Binario de la imagen
   *       400:
   *         description: Identificador inválido
   *       404:
   *         description: La zona no existe o no tiene miniatura
   */
  async show({ request, response, logger }: HttpContext) {
    const zoneId = Number(request.param('zoneId'))

    if (!Number.isInteger(zoneId) || zoneId <= 0) {
      response.status(400)
      return {
        type: 'error',
        title: 'Error de validación',
        detail: 'El identificador de la zona es inválido.',
        key: 'zona-id-invalido',
      }
    }

    const zone = await Zone.query().where('zone_id', zoneId).whereNull('zone_deleted_at').first()

    if (!zone || !zone.zoneThumbnail) {
      response.status(404)
      return {
        type: 'warning',
        title: 'Miniatura no encontrada',
        detail: 'La zona no tiene una miniatura registrada.',
        key: 'miniatura-zona-no-encontrada',
      }
    }

    try {
      const entregada = await new StoredFileStreamService().streamInto(
        { response },
        zone.zoneThumbnail,
        { fallbackContentType: 'image/jpeg' }
      )
      if (entregada) return

      logger.warn(
        { zoneId },
        'Miniatura de zona registrada en base de datos pero ausente en el almacenamiento'
      )
      response.status(404)
      return {
        type: 'warning',
        title: 'Miniatura no encontrada',
        detail: 'La miniatura registrada no está disponible en el almacenamiento.',
        key: 'miniatura-zona-no-disponible',
      }
    } catch (error) {
      logger.error({ err: error, zoneId }, 'Error inesperado al entregar la miniatura de la zona')
      response.status(500)
      return {
        type: 'error',
        title: 'Error del servidor',
        detail: 'No fue posible obtener la miniatura de la zona.',
        key: 'miniatura-zona-error-servidor',
      }
    }
  }
}
