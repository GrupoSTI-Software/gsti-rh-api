import type { HttpContext } from '@adonisjs/core/http'
import PlatformDeviceService from '#services/platform_device_service'
import { createDeviceValidator, listDevicesValidator } from '#validators/platform_device'
import { resolvePlatformDeviceApiError } from '../helpers/platform_device_api_error.js'

/**
 * Controlador del inventario general de aparatos biométricos.
 * Todos los endpoints requieren middleware `auth` + `platformAdmin`.
 *
 * Prefijo: /api/platform/devices/units
 * Ref: USRH1787189981873 · §11 del spec.
 */
export default class PlatformDeviceController {
  private readonly service = new PlatformDeviceService()

  /**
   * @swagger
   * /api/platform/devices/units:
   *   get:
   *     tags:
   *       - Platform Device Inventory
   *     summary: Listar todas las unidades del inventario
   *     description: >
   *       Devuelve el listado de unidades activas con su modelo resuelto en una sola
   *       consulta, ordenadas por fecha de creación descendente.
   *       Acepta `page` y `limit` (máx 100) desde el día uno para no romper el
   *       contrato cuando llegue el tablero de inventario (1874).
   *       La UI de esta rebanada no usa paginación. Sin filtros ni contadores.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *     responses:
   *       '200':
   *         description: Listado de unidades del inventario
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               data:
   *                 devices:
   *                   - platformDeviceId: 1
   *                     platformDeviceSerialNumber: "AXK9-00001"
   *                     platformDeviceOrigin: "propia"
   *                     platformDeviceStockStatus: "disponible"
   *                     platformDeviceAcquisitionCostCents: 485000
   *                     platformDeviceAcquisitionDate: "2026-03-11"
   *                     model:
   *                       platformDeviceModelId: 1
   *                       platformDeviceModelBrand: "ZKTeco"
   *                       platformDeviceModelName: "SpeedFace V5L"
   *                       platformDeviceModelSlug: "zkteco-speedface-v5l"
   *               meta:
   *                 total: 1
   *                 page: 1
   *                 limit: 20
   *                 lastPage: 1
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: AUTH.PLATFORM.FORBIDDEN
   */
  async index({ request, response }: HttpContext) {
    try {
      const query = await request.validateUsing(listDevicesValidator)
      const result = await this.service.listAll({
        page: query.page,
        limit: query.limit,
      })
      return response.status(200).json({ type: 'success', data: { devices: result.devices }, meta: result.meta })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/devices/units/{platformDeviceId}:
   *   get:
   *     tags:
   *       - Platform Device Inventory
   *     summary: Obtener el detalle de una unidad del inventario
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: platformDeviceId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Detalle de la unidad
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: AUTH.PLATFORM.FORBIDDEN
   *       '404':
   *         description: PLT.DEV.DEVICE_NOT_FOUND
   */
  async show({ params, response }: HttpContext) {
    try {
      const device = await this.service.getById(Number(params.platformDeviceId))
      return response.status(200).json({ type: 'success', data: { device } })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/devices/units:
   *   post:
   *     tags:
   *       - Platform Device Inventory
   *     summary: Registrar una nueva unidad en el inventario
   *     description: >
   *       Orden de validación:
   *       1. Modelo existe → 404
   *       2. Modelo vigente → 422 MODEL_NOT_SELECTABLE
   *       3. Coherencia origen/costo → 422 COST_NOT_ALLOWED_FOR_ORIGIN
   *       4. Serie libre → 422 DEVICE_SERIAL_TAKEN (incluye carrera concurrente vía ER_DUP_ENTRY)
   *       5. Crear — siempre en estado disponible.
   *       El costo se captura en centavos (entero). La conversión pesos→centavos
   *       ocurre una sola vez en el cliente: Math.round(pesos * 100).
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - platformDeviceSerialNumber
   *               - platformDeviceModelId
   *               - platformDeviceOrigin
   *             properties:
   *               platformDeviceSerialNumber:
   *                 type: string
   *                 maxLength: 100
   *                 example: "AXK9-00001"
   *               platformDeviceModelId:
   *                 type: integer
   *                 description: ID del modelo vigente del catálogo autorizado
   *               platformDeviceOrigin:
   *                 type: string
   *                 enum: [propia, del_cliente]
   *               platformDeviceAcquisitionCostCents:
   *                 type: integer
   *                 nullable: true
   *                 description: Costo en centavos MXN (solo para origin=propia)
   *                 example: 485000
   *               platformDeviceAcquisitionDate:
   *                 type: string
   *                 format: date
   *                 nullable: true
   *                 description: Fecha de compra YYYY-MM-DD (solo para origin=propia)
   *                 example: "2026-03-11"
   *     responses:
   *       '201':
   *         description: Unidad registrada en estado disponible
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               data:
   *                 device:
   *                   platformDeviceId: 1
   *                   platformDeviceSerialNumber: "AXK9-00001"
   *                   platformDeviceOrigin: "propia"
   *                   platformDeviceStockStatus: "disponible"
   *                   platformDeviceAcquisitionCostCents: 485000
   *                   platformDeviceAcquisitionDate: "2026-03-11"
   *                   model:
   *                     platformDeviceModelId: 1
   *                     platformDeviceModelBrand: "ZKTeco"
   *                     platformDeviceModelName: "SpeedFace V5L"
   *                     platformDeviceModelSlug: "zkteco-speedface-v5l"
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: AUTH.PLATFORM.FORBIDDEN
   *       '404':
   *         description: PLT.DEV.MODEL_NOT_FOUND
   *       '422':
   *         description: >
   *           PLT.DEV.VAL_INPUT — Body inválido |
   *           PLT.DEV.MODEL_NOT_SELECTABLE — Modelo no vigente |
   *           PLT.DEV.COST_NOT_ALLOWED_FOR_ORIGIN — Costo/fecha en aparato del cliente |
   *           PLT.DEV.DEVICE_SERIAL_TAKEN — Serial ya registrado (incluyendo bajas lógicas y carrera concurrente)
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createDeviceValidator)
      const device = await this.service.create({
        platformDeviceSerialNumber: data.platformDeviceSerialNumber,
        platformDeviceModelId: data.platformDeviceModelId,
        platformDeviceOrigin: data.platformDeviceOrigin,
        platformDeviceAcquisitionCostCents: data.platformDeviceAcquisitionCostCents,
        platformDeviceAcquisitionDate: data.platformDeviceAcquisitionDate,
      })
      return response.status(201).json({ type: 'success', data: { device } })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }
}
