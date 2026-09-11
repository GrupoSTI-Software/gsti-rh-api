import type { HttpContext } from '@adonisjs/core/http'
import PlatformDeviceDiscrepancyService from '#services/platform_device_discrepancy_service'
import { listDeviceDiscrepanciesValidator } from '#validators/platform_device_discrepancy'
import { resolvePlatformDeviceApiError } from '../helpers/platform_device_api_error.js'

/**
 * Tablero de discrepancias entre el inventario de plataforma y los puntos de
 * acceso de los tenants. Solo lectura — cero escrituras (RN6).
 *
 * Prefijo: /api/platform/devices/discrepancies
 * Ref: USRH1787195527841 · §11 del spec.
 */
export default class PlatformDeviceDiscrepancyController {
  private readonly service = new PlatformDeviceDiscrepancyService()

  /**
   * @swagger
   * /api/platform/devices/discrepancies:
   *   get:
   *     tags:
   *       - Platform Device Inventory
   *     summary: Listar discrepancias entre el inventario y los puntos de acceso de los tenants
   *     description: >
   *       Calcula AL VUELO (no persiste nada) cuatro tipos de discrepancia
   *       entre `platform_devices` y `access_points` de todos los tenants:
   *       AP_AUSENTE (entrega vigente sin punto de acceso vivo/encendido),
   *       AP_HUERFANO (punto de acceso vivo/encendido sin entrega vigente),
   *       SERIE_DESCONOCIDA (serie viva sin match en el inventario, con
   *       platform_device_id poblado) y SERIE_AUTODESCUBIERTA (igual, pero
   *       con platform_device_id NULL — la creó el anuncio automático del
   *       aparato al conectarse, no un humano; la empresa mostrada puede no
   *       ser la real, porque ese registro cuelga los desconocidos de la
   *       primera empresa de la tabla). No corrige nada: solo informa.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [AP_AUSENTE, AP_HUERFANO, SERIE_DESCONOCIDA, SERIE_AUTODESCUBIERTA]
   *       - in: query
   *         name: tenantPublicId
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       '200':
   *         description: Discrepancias vigentes (array vacío si los dos planos cuadran)
   *         content:
   *           application/json:
   *             example:
   *               type: success
   *               data:
   *                 - type: "AP_AUSENTE"
   *                   deviceId: 7
   *                   serialNumber: "AXK1234"
   *                   tenantPublicId: "6bc18b8e-a604-464b-9441-a0fbe678765d"
   *                   tenantName: "Acme SA de CV"
   *                   accessPointId: null
   *                 - type: "SERIE_AUTODESCUBIERTA"
   *                   deviceId: null
   *                   serialNumber: "CJ9F2400A8A31"
   *                   tenantPublicId: "11aa2233-..."
   *                   tenantName: "Primera Empresa SA"
   *                   accessPointId: 412
   *       '401':
   *         description: Sin autenticar
   *       '403':
   *         description: AUTH.PLATFORM.FORBIDDEN
   *       '422':
   *         description: PLT.DEV.VAL_INPUT — type fuera del catálogo o tenantPublicId con formato inválido
   */
  async index({ request, response }: HttpContext) {
    try {
      const query = await request.validateUsing(listDeviceDiscrepanciesValidator)
      const data = await this.service.list({
        type: query.type,
        tenantPublicId: query.tenantPublicId,
      })
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status, ...body } = resolvePlatformDeviceApiError(error)
      return response.status(status).json(body)
    }
  }
}
