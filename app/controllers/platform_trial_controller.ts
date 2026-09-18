import type { HttpContext } from '@adonisjs/core/http'
import PlatformTrialService from '#services/platform_trial_service'
import { TRIAL_METRIC_ERROR_TEXTS } from '../constants/platform_metric_error_codes.js'
import { resolvePlatformMetricApiError } from '../helpers/platform_metric_api_error.js'

/**
 * Ventana y estado de la prueba de un tenant (USRH1789079078169).
 *
 * Consulta de plataforma, sin pantalla: resuelve, con una sola definición,
 * si una empresa tuvo prueba, de cuándo a cuándo corrió, en qué punto va y
 * si sigue viva o ya terminó.
 *
 * Todo se calcula al momento sobre columnas que ya existen: sin caché, sin
 * migración. No publica identificadores internos ni dato de personas —
 * solo `publicId`, `nombre` y las fechas/conteos de la ventana.
 */
export default class PlatformTrialController {
  private readonly service = new PlatformTrialService()

  /**
   * @swagger
   * /api/platform/metrics/tenants/{publicId}/trial:
   *   get:
   *     tags:
   *       - Platform · Prueba de tenants
   *     summary: Ventana y estado de la prueba de una empresa
   *     description: |
   *       Devuelve, de una sola empresa, cuál fue su prueba: de cuándo a
   *       cuándo corrió, cuántos días lleva, cuántos le quedan y si sigue
   *       viva o ya terminó. `prueba: null` es la respuesta válida para
   *       quien nunca tuvo prueba, no un error.
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: publicId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Tenant y su prueba (prueba nula si nunca tuvo)
   *       '404':
   *         description: Empresa no encontrada o borrada lógicamente
   *       '403':
   *         description: Sin permisos de administrador de plataforma. Respuesta del guard, sin campo code.
   *       '500':
   *         description: Falla no controlada al resolver la prueba
   *
   * @index
   * @summary Ventana y estado de la prueba de una empresa
   * @description Tenant y su prueba por `publicId`. `prueba` nulo cuando nunca tuvo prueba.
   * @tag Platform · Prueba de tenants
   * @operationId getPlatformTenantTrial
   * @security [{"bearerAuth": []}]
   * @responseBody 200 - {"type": "success", "data": {"tenant": {"publicId": "3f2b…", "nombre": "Aceros del Norte"}, "prueba": {"inicio": "2026-09-01", "fin": "2026-09-08", "finEfectivo": "2026-09-05", "diasContratados": 7, "diasTranscurridos": 4, "diasRestantes": 3, "estado": "viva", "resultado": null, "fechaResultado": null}}}
   * @responseBody 404 - {"title": "No fue posible obtener la prueba del tenant", "detail": "La empresa solicitada no existe o no está disponible.", "key": "tenant-no-encontrado", "code": "PLT.MET.TENANT_NOT_FOUND"}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 500 - {"title": "string", "detail": "string", "key": "error-inesperado-al-obtener-la-prueba-del-tenant", "code": "PLT.MET.SYS_UNHANDLED"}
   */
  async show({ params, response }: HttpContext) {
    try {
      const data = await this.service.getTenantTrial(params.publicId)
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformMetricApiError(
        error,
        TRIAL_METRIC_ERROR_TEXTS
      )
      return response.status(httpStatus).json(body)
    }
  }
}
