import type { HttpContext } from '@adonisjs/core/http'
import PlatformDeviceModelService from '#services/platform_device_model_service'
import type { PlatformDeviceModelStatus } from '#models/platform_device_model'
import {
  createDeviceModelValidator,
  updateDeviceModelValidator,
  changeDeviceModelStatusValidator,
} from '#validators/platform_device'
import { resolvePlatformDeviceApiError } from '../helpers/platform_device_api_error.js'

/**
 * Controlador del catálogo global de modelos de dispositivo biométrico.
 * Todos los endpoints requieren middleware `auth` + `platformAdmin`.
 *
 * Ref: USRH1787189981870.
 */
export default class PlatformDeviceModelController {
  private readonly service = new PlatformDeviceModelService()

  /**
   * @swagger
   * /api/platform/devices/models:
   *   get:
   *     tags:
   *       - Platform Device Models
   *     summary: Listar todos los modelos de dispositivo del catálogo
   *     description: >
   *       Devuelve el catálogo completo de modelos autorizados por GSTI
   *       (incluyendo descontinuados). Los modelos con baja lógica se omiten.
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Catálogo de modelos
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     deviceModels:
   *                       type: array
   *                       items:
   *                         $ref: '#/components/schemas/DeviceModelRecord'
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: Usuario sin marcador de plataforma
   */
  async index({ response }: HttpContext) {
    try {
      const deviceModels = await this.service.listAll()
      return response.status(200).json({ type: 'success', data: { deviceModels } })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/devices/models/{deviceModelId}:
   *   get:
   *     tags:
   *       - Platform Device Models
   *     summary: Obtener el detalle de un modelo de dispositivo
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: deviceModelId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Detalle del modelo
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: Usuario sin marcador de plataforma
   *       '404':
   *         description: >
   *           PLT.DEV.MODEL_NOT_FOUND — Modelo no encontrado o con baja lógica
   */
  async show({ params, response }: HttpContext) {
    try {
      const deviceModel = await this.service.getById(Number(params.deviceModelId))
      return response.status(200).json({ type: 'success', data: { deviceModel } })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/devices/models:
   *   post:
   *     tags:
   *       - Platform Device Models
   *     summary: Registrar un nuevo modelo de dispositivo en el catálogo
   *     description: >
   *       El `slug` es inmutable y actúa como llave natural. Si no se envía,
   *       se auto-genera a partir de `brand` + `name` (kebab-case). El estado
   *       inicial por defecto es `en_validacion`.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - brand
   *               - name
   *             properties:
   *               brand:
   *                 type: string
   *                 maxLength: 100
   *                 example: ZKTeco
   *               name:
   *                 type: string
   *                 maxLength: 191
   *                 example: SpeedFace V5L
   *               slug:
   *                 type: string
   *                 maxLength: 100
   *                 description: >
   *                   Slug kebab-case. Si se omite se genera automáticamente.
   *                   Immutable tras creación.
   *                 example: zkteco-speedface-v5l
   *               status:
   *                 type: string
   *                 enum: [vigente, en_validacion, descontinuado]
   *                 default: en_validacion
   *     responses:
   *       '201':
   *         description: Modelo creado exitosamente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     deviceModel:
   *                       $ref: '#/components/schemas/DeviceModelRecord'
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: Usuario sin marcador de plataforma
   *       '422':
   *         description: >
   *           PLT.DEV.VAL_INPUT — Datos inválidos |
   *           PLT.DEV.MODEL_SLUG_TAKEN — El slug ya está registrado
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createDeviceModelValidator)
      const deviceModel = await this.service.create(data)
      return response.status(201).json({ type: 'success', data: { deviceModel } })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/devices/models/{deviceModelId}:
   *   patch:
   *     tags:
   *       - Platform Device Models
   *     summary: Actualizar brand y/o name de un modelo (slug inmutable)
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: deviceModelId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               brand:
   *                 type: string
   *                 maxLength: 100
   *               name:
   *                 type: string
   *                 maxLength: 191
   *     responses:
   *       '200':
   *         description: Modelo actualizado
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: Usuario sin marcador de plataforma
   *       '404':
   *         description: PLT.DEV.MODEL_NOT_FOUND
   *       '422':
   *         description: PLT.DEV.VAL_INPUT — Datos inválidos
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateDeviceModelValidator)
      const deviceModel = await this.service.update(Number(params.deviceModelId), data)
      return response.status(200).json({ type: 'success', data: { deviceModel } })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/devices/models/{deviceModelId}/status:
   *   put:
   *     tags:
   *       - Platform Device Models
   *     summary: Cambiar el estado de homologación de un modelo
   *     description: >
   *       Transiciones permitidas:
   *       en_validacion → vigente | descontinuado;
   *       vigente → descontinuado;
   *       descontinuado → en_validacion.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: deviceModelId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - status
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [vigente, en_validacion, descontinuado]
   *     responses:
   *       '200':
   *         description: Estado del modelo actualizado
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: Usuario sin marcador de plataforma
   *       '404':
   *         description: PLT.DEV.MODEL_NOT_FOUND
   *       '422':
   *         description: PLT.DEV.VAL_INPUT — Estado inválido
   */
  async changeStatus({ params, request, response }: HttpContext) {
    try {
      const { status } = await request.validateUsing(changeDeviceModelStatusValidator)
      const deviceModel = await this.service.changeStatus(
        Number(params.deviceModelId),
        status as PlatformDeviceModelStatus
      )
      return response.status(200).json({ type: 'success', data: { deviceModel } })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(httpStatus).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/devices/models/{deviceModelId}:
   *   delete:
   *     tags:
   *       - Platform Device Models
   *     summary: Dar de baja lógica un modelo del catálogo
   *     description: >
   *       Operación de baja lógica (soft delete). El modelo deja de aparecer
   *       en listados y no puede ser asignado a nuevas unidades de inventario.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: deviceModelId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '204':
   *         description: Modelo dado de baja (sin cuerpo)
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: Usuario sin marcador de plataforma
   *       '404':
   *         description: PLT.DEV.MODEL_NOT_FOUND
   */
  async destroy({ params, response }: HttpContext) {
    try {
      await this.service.softDelete(Number(params.deviceModelId))
      return response.status(204).send(null)
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }
}
