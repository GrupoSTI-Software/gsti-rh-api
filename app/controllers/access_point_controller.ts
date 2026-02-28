import { HttpContext } from '@adonisjs/core/http'
import AccessPoint from '#models/access_point'
import AccessPointService from '#services/access_point_service'
import Ws from '#services/ws'
import { createAccessPointValidator, updateAccessPointValidator } from '#validators/access_point'
import { DateTime } from 'luxon'

export default class AccessPointController {
  /**
   * @swagger
   * /api/access-points:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - AccessPoints
   *     summary: get access points
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search term for access point name
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
      const accessPointService = new AccessPointService(i18n)
      const accessPoints = await accessPointService.index({
        search,
        page,
        limit,
      })

      const CONNECTION_TIMEOUT_MS = 15000
      const now = DateTime.now()
      const list = accessPoints.all()
      for (const ap of list) {
        const lastConnection = ap.accessPointLastConnection
        const isOlderThanTimeout =
          !lastConnection ||
          now.diff(lastConnection, 'milliseconds').as('milliseconds') > CONNECTION_TIMEOUT_MS
        if (isOlderThanTimeout && ap.accessPointStatus !== 0) {
          await accessPointService.updateConnectionStatus(
            ap.accessPointId,
            0,
            lastConnection ?? null
          )
          ap.accessPointStatus = 0
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: t('access_points'),
        message: t('resources_were_found_successfully'),
        data: {
          accessPoints,
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
   * /api/access-points:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - AccessPoints
   *     summary: create new access point
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               accessPointName:
   *                 type: string
   *                 description: Access point name or alias
   *                 required: true
   *                 default: ''
   *               businessUnitId:
   *                 type: number
   *                 description: Business unit id
   *                 required: true
   *               accessPointActive:
   *                 type: number
   *                 description: Active status (0 = inactive, 1 = active)
   *                 default: 0
   *               accessPointSerialNumber:
   *                 type: string
   *                 description: Serial number
   *               accessPointDeviceName:
   *                 type: string
   *                 description: Device name
   *               accessPointIp:
   *                 type: string
   *                 description: IP address
   *               accessPointMac:
   *                 type: string
   *                 description: MAC address
   *               accessPointFirmware:
   *                 type: string
   *                 description: Firmware version
   *               accessPointPlatform:
   *                 type: string
   *                 description: Platform information
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async store({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const accessPoint = {
        accessPointName: (request.input('accessPointName', '') || '').toString().trim(),
        businessUnitId: Number(request.input('businessUnitId')),
        accessPointActive: Number(request.input('accessPointActive', 0)),
        accessPointSerialNumber: request.input('accessPointSerialNumber')
          ? request.input('accessPointSerialNumber').toString().trim()
          : null,
        accessPointDeviceName: request.input('accessPointDeviceName')
          ? request.input('accessPointDeviceName').toString().trim()
          : null,
        accessPointIp: request.input('accessPointIp')
          ? request.input('accessPointIp').toString().trim()
          : null,
        accessPointMac: request.input('accessPointMac')
          ? request.input('accessPointMac').toString().trim()
          : null,
        accessPointFirmware: request.input('accessPointFirmware')
          ? request.input('accessPointFirmware').toString().trim()
          : null,
        accessPointPlatform: request.input('accessPointPlatform')
          ? request.input('accessPointPlatform').toString().trim()
          : null,
        accessPointStatus: request.input('accessPointStatus') !== undefined
          ? Number(request.input('accessPointStatus'))
          : 0
      } as AccessPoint

      if (request.input('accessPointLastConnection')) {
        accessPoint.accessPointLastConnection = DateTime.fromISO(request.input('accessPointLastConnection').toString())
      }

      const accessPointService = new AccessPointService(i18n)
      await request.validateUsing(createAccessPointValidator)
      const verifyInfo = await accessPointService.verifyInfo(accessPoint)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...accessPoint },
        }
      }
      const newAccessPoint = await accessPointService.create(accessPoint)
      const userId = auth.user?.userId
      if (userId) {
        const rawHeaders = request.request.rawHeaders
        const logAccessPoint = await accessPointService.createActionLog(rawHeaders, 'store')
        logAccessPoint.user_id = userId
        logAccessPoint.record_current = JSON.parse(JSON.stringify(newAccessPoint))
        await accessPointService.saveActionOnLog(logAccessPoint)
      }
      response.status(201)
      return {
        type: 'success',
        title: t('access_point'),
        message: t('resource_was_created_successfully'),
        data: { accessPoint: newAccessPoint },
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
   * /api/access-points/{accessPointId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - AccessPoints
   *     summary: update access point
   *     parameters:
   *       - in: path
   *         name: accessPointId
   *         schema:
   *           type: number
   *         description: Access point id
   *         required: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async update({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const accessPointId = Number(request.param('accessPointId'))
      if (!accessPointId || Number.isNaN(accessPointId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('access_point') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const currentAccessPoint = await AccessPoint.query()
        .whereNull('access_point_deleted_at')
        .where('access_point_id', accessPointId)
        .first()
      if (!currentAccessPoint) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('access_point') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('access_point') }),
          data: { accessPointId },
        }
      }
      const previousAccessPoint = JSON.parse(JSON.stringify(currentAccessPoint))
      const accessPoint = {
        accessPointId,
        accessPointName: (request.input('accessPointName', '') || '').toString().trim(),
        businessUnitId: Number(request.input('businessUnitId')),
        accessPointActive: Number(request.input('accessPointActive', 0)),
        accessPointSerialNumber: request.input('accessPointSerialNumber')
          ? request.input('accessPointSerialNumber').toString().trim()
          : null,
        accessPointDeviceName: request.input('accessPointDeviceName')
          ? request.input('accessPointDeviceName').toString().trim()
          : null,
        accessPointIp: request.input('accessPointIp')
          ? request.input('accessPointIp').toString().trim()
          : null,
        accessPointMac: request.input('accessPointMac')
          ? request.input('accessPointMac').toString().trim()
          : null,
        accessPointFirmware: request.input('accessPointFirmware')
          ? request.input('accessPointFirmware').toString().trim()
          : null,
        accessPointPlatform: request.input('accessPointPlatform')
          ? request.input('accessPointPlatform').toString().trim()
          : null,
        accessPointStatus: request.input('accessPointStatus') !== undefined
          ? Number(request.input('accessPointStatus'))
          : currentAccessPoint.accessPointStatus,
        accessPointLastConnection: request.input('accessPointLastConnection')
          ? DateTime.fromISO(request.input('accessPointLastConnection').toString())
          : currentAccessPoint.accessPointLastConnection,
      } as AccessPoint

      await request.validateUsing(updateAccessPointValidator)
      const accessPointService = new AccessPointService(i18n)
      const verifyInfo = await accessPointService.verifyInfo(accessPoint)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...accessPoint },
        }
      }
      const updateAccessPoint = await accessPointService.update(currentAccessPoint, accessPoint)
      const userId = auth.user?.userId
      if (userId) {
        const rawHeaders = request.request.rawHeaders
        const logAccessPoint = await accessPointService.createActionLog(rawHeaders, 'update')
        logAccessPoint.user_id = userId
        logAccessPoint.record_previous = previousAccessPoint
        logAccessPoint.record_current = JSON.parse(JSON.stringify(updateAccessPoint))
        await accessPointService.saveActionOnLog(logAccessPoint)
      }
      const serialNumber = updateAccessPoint.accessPointSerialNumber
      if (serialNumber && Ws.io) {
        const alias = updateAccessPoint.accessPointName
        Ws.io.emit(`zkdevice-info-from:${serialNumber}`, {
          alias,
          serial_number: serialNumber,
          active: updateAccessPoint.accessPointActive,
        })
      }
      response.status(201)
      return {
        type: 'success',
        title: t('access_point'),
        message: t('resource_was_updated_successfully'),
        data: { accessPoint: updateAccessPoint },
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
   * /api/access-points/{accessPointId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - AccessPoints
   *     summary: delete access point
   *     parameters:
   *       - in: path
   *         name: accessPointId
   *         schema:
   *           type: number
   *         description: Access point id
   *         required: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async delete({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const accessPointId = Number(request.param('accessPointId'))
      if (!accessPointId || Number.isNaN(accessPointId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('access_point') }),
          message: t('missing_data_to_process'),
          data: { accessPointId },
        }
      }
      const currentAccessPoint = await AccessPoint.query()
        .whereNull('access_point_deleted_at')
        .where('access_point_id', accessPointId)
        .first()
      if (!currentAccessPoint) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('access_point') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('access_point') }),
          data: { accessPointId },
        }
      }
      const accessPointService = new AccessPointService(i18n)
      const deletedAccessPoint = await accessPointService.delete(currentAccessPoint)
      const userId = auth.user?.userId
      if (userId) {
        const rawHeaders = request.request.rawHeaders
        const logAccessPoint = await accessPointService.createActionLog(rawHeaders, 'delete')
        logAccessPoint.user_id = userId
        logAccessPoint.record_current = JSON.parse(JSON.stringify(deletedAccessPoint))
        await accessPointService.saveActionOnLog(logAccessPoint)
      }

      const serialNumber = currentAccessPoint.accessPointSerialNumber
      if (serialNumber && Ws.io) {
        Ws.io.emit(`zkdevice-delete-from:${serialNumber}`)
      }

      response.status(201)
      return {
        type: 'success',
        title: t('access_point'),
        message: t('resource_was_deleted_successfully'),
        data: { accessPoint: deletedAccessPoint },
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
   * /api/access-points/{accessPointId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - AccessPoints
   *     summary: get access point by id
   *     parameters:
   *       - in: path
   *         name: accessPointId
   *         schema:
   *           type: number
   *         description: Access point id
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
      const accessPointId = Number(request.param('accessPointId'))
      if (!accessPointId || Number.isNaN(accessPointId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('access_point') }),
          message: t('missing_data_to_process'),
          data: { accessPointId },
        }
      }
      const accessPointService = new AccessPointService(i18n)
      let accessPoint = await accessPointService.show(accessPointId)
      if (!accessPoint) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('access_point') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('access_point') }),
          data: { accessPointId },
        }
      }

      const CONNECTION_TIMEOUT_MS = 10000
      const now = DateTime.now()
      const lastConnection = accessPoint.accessPointLastConnection
      const isOlderThanTimeout =
        !lastConnection ||
        now.diff(lastConnection, 'milliseconds').as('milliseconds') > CONNECTION_TIMEOUT_MS

      if (isOlderThanTimeout && accessPoint.accessPointStatus !== 0) {
        const updated = await accessPointService.updateConnectionStatus(
          accessPointId,
          0,
          lastConnection ?? null
        )
        if (updated) {
          accessPoint = updated
        }
      }

      response.status(200)
      return {
        type: 'success',
        title: t('access_point'),
        message: t('resource_was_found_successfully'),
        data: { accessPoint },
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
   * /api/access-points/{accessPointId}/connection-status:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - AccessPoints
   *     summary: update access point connection status and last connection
   *     description: Endpoint para actualizar únicamente el estatus de conexión (online/offline) y la última conexión del punto de acceso. Usado por aplicaciones externas.
   *     parameters:
   *       - in: path
   *         name: accessPointId
   *         schema:
   *           type: number
   *         description: Access point id
   *         required: true
   *     responses:
   *       '200':
   *         description: Connection status updated successfully
   *       '404':
   *         description: Access point not found
   *       default:
   *         description: Unexpected error
   */
  async updateConnectionStatus({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const accessPointId = Number(request.param('accessPointId'))
      if (!accessPointId || Number.isNaN(accessPointId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('access_point') }),
          message: t('missing_data_to_process'),
          data: { accessPointId },
        }
      }

      const currentAccessPoint = await AccessPoint.query()
        .whereNull('access_point_deleted_at')
        .where('access_point_id', accessPointId)
        .first()

      if (!currentAccessPoint) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('access_point') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('access_point') }),
          data: { accessPointId },
        }
      }

      const serialNumber = currentAccessPoint.accessPointSerialNumber
      if (!serialNumber || String(serialNumber).trim() === '') {
        response.status(400)
        return {
          type: 'warning',
          title: t('access_point'),
          message: t('missing_data_to_process'),
          data: { accessPointId },
        }
      }

      if (!Ws.io) {
        response.status(503)
        return {
          type: 'warning',
          title: t('access_point'),
          message: t('connection_status_no_response_from_device'),
          data: { accessPoint: currentAccessPoint },
        }
      }

      const eventName = `zkdevice-info-request:${serialNumber}`
      const timeoutMs = 8000

      const responsePromise = Ws.waitForZkDeviceInfo(serialNumber, timeoutMs)
      Ws.io.emit(eventName, { serial_number: serialNumber })

      try {
        const deviceInfoResult = await responsePromise
        const resultPayload = deviceInfoResult as { accessPoint?: AccessPoint }
        const accessPointIdFromDevice = resultPayload?.accessPoint?.accessPointId ?? currentAccessPoint.accessPointId

        const accessPoint = await AccessPoint.query()
          .whereNull('access_point_deleted_at')
          .where('access_point_id', accessPointIdFromDevice)
          .firstOrFail()

        response.status(200)
        return {
          type: 'success',
          title: t('access_point'),
          message: t('connection_status_updated_successfully'),
          data: { accessPoint },
        }
      } catch (err) {
        const isTimeout = err instanceof Error && err.message === 'TIMEOUT'
        response.status(isTimeout ? 408 : 503)
        return {
          type: 'warning',
          title: t('access_point'),
          message: t('connection_status_no_response_from_device'),
          data: {
            accessPoint: currentAccessPoint,
            connectionObtained: false,
          },
        }
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
}
