import { HttpContext } from '@adonisjs/core/http'
import Zone from '#models/zone'
import ZoneService from '#services/zone_service'
import { createZoneValidator, updateZoneValidator } from '#validators/zone'
import UploadService from '#services/upload_service'

export default class ZoneController {
  /**
   * @swagger
   * /api/zones:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Zones
   *     summary: get zones
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search term for zone name
   *         schema:
   *           type: string
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async index({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const search = request.input('search')
      const rawPage = Number(request.input('page', 1))
      const rawLimit = Number(request.input('limit', 100))
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      const zoneService = new ZoneService(i18n)
      const zones = await zoneService.index({
        search,
        page,
        limit,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('zones'),
        message: t('resources_were_found_successfully'),
        data: {
          zones,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/zones:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Zones
   *     summary: create new zone
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               zoneName:
   *                 type: string
   *                 description: Zone name
   *                 required: true
   *                 default: ''
   *               zoneAddress:
   *                 type: string
   *                 description: Zone address
   *                 required: true
   *                 default: ''
   *               zonePolygon:
   *                 type: string
   *                 description: Zone polygon as JSON string
   *                 required: true
   *                 default: ''
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const zoneThumbnailInput = request.input('zoneThumbnail')
      const zone = {
        zoneName: (request.input('zoneName', '') || '').toString().trim(),
        zoneThumbnail:
          typeof zoneThumbnailInput === 'string' && zoneThumbnailInput
            ? zoneThumbnailInput.trim()
            : null,
        zoneAddress: (request.input('zoneAddress', '') || '').toString().trim(),
        zonePolygon: (request.input('zonePolygon', '') || '').toString().trim(),
      } as Zone
      if (!zone.zonePolygon || !this.isValidFeatureCollection(zone.zonePolygon)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('zone'),
          message: t('zone_polygon_invalid'),
          data: { ...zone },
        }
      }
      const zoneService = new ZoneService(i18n)
      await request.validateUsing(createZoneValidator)
      const verifyInfo = await zoneService.verifyInfo(zone)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...zone },
        }
      }
      const newZone = await zoneService.create(zone)
      response.status(201)
      return {
        type: 'success',
        title: t('zone'),
        message: t('resource_was_created_successfully'),
        data: { zone: newZone },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/zones/{zoneId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Zones
   *     summary: update zone
   *     parameters:
   *       - in: path
   *         name: zoneId
   *         schema:
   *           type: number
   *         description: Zone id
   *         required: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const zoneId = Number(request.param('zoneId'))
      if (!zoneId || Number.isNaN(zoneId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('zone') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const currentZone = await Zone.query()
        .whereNull('zone_deleted_at')
        .where('zone_id', zoneId)
        .first()
      if (!currentZone) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('zone') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('zone') }),
          data: { zoneId },
        }
      }
      const zoneThumbnailInput = request.input('zoneThumbnail')
      const zone = {
        zoneId,
        zoneName: (request.input('zoneName', '') || '').toString().trim(),
        zoneThumbnail:
          typeof zoneThumbnailInput === 'string' && zoneThumbnailInput
            ? zoneThumbnailInput.trim()
            : null,
        zoneAddress: (request.input('zoneAddress', '') || '').toString().trim(),
        zonePolygon: (request.input('zonePolygon', '') || '').toString().trim(),
      } as Zone
      if (!zone.zonePolygon || !this.isValidFeatureCollection(zone.zonePolygon)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('zone'),
          message: t('zone_polygon_invalid'),
          data: { ...zone },
        }
      }
      await request.validateUsing(updateZoneValidator)
      const zoneService = new ZoneService(i18n)
      const verifyInfo = await zoneService.verifyInfo(zone)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...zone },
        }
      }
      const updateZone = await zoneService.update(currentZone, zone)
      response.status(201)
      return {
        type: 'success',
        title: t('zone'),
        message: t('resource_was_updated_successfully'),
        data: { zone: updateZone },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/zones/{zoneId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Zones
   *     summary: delete zone
   *     parameters:
   *       - in: path
   *         name: zoneId
   *         schema:
   *           type: number
   *         description: Zone id
   *         required: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async delete({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const zoneId = Number(request.param('zoneId'))
      if (!zoneId || Number.isNaN(zoneId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('zone') }),
          message: t('missing_data_to_process'),
          data: { zoneId },
        }
      }
      const currentZone = await Zone.query()
        .whereNull('zone_deleted_at')
        .where('zone_id', zoneId)
        .first()
      if (!currentZone) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('zone') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('zone') }),
          data: { zoneId },
        }
      }
      const zoneService = new ZoneService(i18n)
      const deletedZone = await zoneService.delete(currentZone)
      response.status(201)
      return {
        type: 'success',
        title: t('zone'),
        message: t('resource_was_deleted_successfully'),
        data: { zone: deletedZone },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/zones/{zoneId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Zones
   *     summary: get zone by id
   *     parameters:
   *       - in: path
   *         name: zoneId
   *         schema:
   *           type: number
   *         description: Zone id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async show({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const zoneId = Number(request.param('zoneId'))
      if (!zoneId || Number.isNaN(zoneId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('zone') }),
          message: t('missing_data_to_process'),
          data: { zoneId },
        }
      }
      const zoneService = new ZoneService(i18n)
      const zone = await zoneService.show(zoneId)
      if (!zone) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('zone') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('zone') }),
          data: { zoneId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('zone'),
        message: t('resource_was_found_successfully'),
        data: { zone },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/zones/{zoneId}/thumbnail:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Zones
   *     summary: upload zone thumbnail
   *     parameters:
   *       - in: path
   *         name: zoneId
   *         schema:
   *           type: number
   *         description: Zone id
   *         required: true
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               thumbnail:
   *                 type: string
   *                 format: binary
   *     responses:
   *       '200':
   *         description: Thumbnail uploaded successfully
   *       default:
   *         description: Unexpected error
   */
  async uploadThumbnail({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    const uploadService = new UploadService()
    const zoneService = new ZoneService(i18n)

    const validationOptions = {
      types: ['image'],
      size: '6mb',
    }
    const zoneId = request.param('zoneId')
    const thumbnail = request.file('thumbnail', validationOptions)

    if (!thumbnail) {
      response.status(400)
      return {
        type: 'warning',
        title: t('zone'),
        message: t('please_upload_thumbnail'),
        data: {},
      }
    }

    const currentZone = await Zone.query()
      .whereNull('zone_deleted_at')
      .where('zone_id', zoneId)
      .first()

    if (!currentZone) {
      response.status(404)
      return {
        type: 'warning',
        title: t('entity_was_not_found', { entity: t('zone') }),
        message: t('entity_was_not_found_with_entered_id', { entity: t('zone') }),
        data: { zoneId },
      }
    }

    try {
      const fileName = `${new Date().getTime()}_${thumbnail.clientName}`
      const thumbnailUrl = await uploadService.fileUpload(thumbnail, 'zones', fileName)

      if (currentZone.zoneThumbnail) {
        await uploadService.deleteFile(currentZone.zoneThumbnail)
      }

      const zone = await zoneService.updateZoneThumbnailUrl(zoneId, thumbnailUrl)
      response.status(200)
      return {
        type: 'success',
        title: t('zone'),
        message: t('resource_was_updated_successfully'),
        data: { url: thumbnailUrl, zone },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }

  private isValidFeatureCollection(polygon: string) {
    try {
      const parsed = JSON.parse(polygon)
      if (!parsed || typeof parsed !== 'object') {
        return false
      }
      if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
        return false
      }
      return parsed.features.every((feature: any) => {
        if (!feature || typeof feature !== 'object') {
          return false
        }
        if (feature.type !== 'Feature' || !feature.geometry) {
          return false
        }
        const geometry = feature.geometry
        if (!geometry || typeof geometry !== 'object') {
          return false
        }
        if (!geometry.type || !Array.isArray(geometry.coordinates)) {
          return false
        }
        return true
      })
    } catch (error) {
      return false
    }
  }
}


