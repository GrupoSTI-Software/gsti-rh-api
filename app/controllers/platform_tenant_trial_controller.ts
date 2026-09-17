import type { HttpContext } from '@adonisjs/core/http'
import PlatformTenantTrialService from '#services/platform_tenant_trial_service'
import { TENANT_TRIAL_METRIC_ERROR_TEXTS } from '../constants/platform_metric_error_codes.js'
import { resolvePlatformMetricApiError } from '../helpers/platform_metric_api_error.js'
import {
  tenantTrialBatchValidator,
  tenantTrialBatchValidatorMessages,
} from '../validators/platform_metric.js'

/** Tope defensivo del lote — evita un `whereIn` sin límite desde el Panel. */
const MAX_BATCH_IDS = 200

/**
 * Ventana y estado de la prueba de un tenant (USRH1789079078169).
 *
 * Consulta de plataforma, sin pantalla: resuelve, con una sola definición,
 * si una empresa tuvo prueba, de cuándo a cuándo corrió, en qué punto va y si
 * sigue viva o ya terminó — en las tres formas que consumen las rebanadas
 * siguientes de esta tanda (individual, en lote, universo de vivas).
 *
 * Todo se calcula al momento sobre columnas que ya existen: sin caché, sin
 * migración. No publica identidad de personas ni identificadores internos —
 * solo el `businessUnitPublicId` y el nombre de la empresa.
 */
export default class PlatformTenantTrialController {
  private readonly service = new PlatformTenantTrialService()

  /**
   * @swagger
   * /api/platform/tenant-trials/live:
   *   get:
   *     tags:
   *       - Platform · Prueba de tenants
   *     summary: Universo de todas las pruebas vivas de la plataforma
   *     description: |
   *       Devuelve el snapshot de la prueba de cada empresa cuya prueba está
   *       viva en este momento. `status = 'trialing'` es, por construcción,
   *       exactamente ese universo (RN-01: una prueba viva por empresa).
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Arreglo de snapshots de prueba, uno por empresa con prueba viva
   *       '403':
   *         description: Sin permisos de administrador de plataforma. Respuesta del guard, sin campo code.
   *       '500':
   *         description: Falla no controlada al calcular el universo de pruebas vivas
   *
   * @index
   * @summary Universo de todas las pruebas vivas de la plataforma
   * @description Snapshot de la prueba de cada empresa con prueba viva ahora mismo.
   * @tag Platform · Prueba de tenants
   * @operationId getPlatformTenantTrialsLive
   * @security [{"bearerAuth": []}]
   * @responseBody 200 - {"type": "success", "data": [{"businessUnitPublicId": "uuid", "businessUnitName": "Acme", "tuvoPrueba": true, "estado": "viva", "ventana": {"inicio": "2026-09-01", "fin": "2026-09-08"}, "diasContratados": 7, "diasTranscurridos": 3, "diasRestantes": 4, "medicionHasta": "2026-09-04", "resultado": null}]}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 500 - {"title": "string", "detail": "string", "key": "error-inesperado-al-obtener-la-prueba-del-tenant", "code": "PLT.MET.SYS_UNHANDLED"}
   */
  async live({ response }: HttpContext) {
    try {
      const data = await this.service.resolveLiveUniverse()
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformMetricApiError(
        error,
        TENANT_TRIAL_METRIC_ERROR_TEXTS
      )
      return response.status(httpStatus).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/tenant-trials:
   *   get:
   *     tags:
   *       - Platform · Prueba de tenants
   *     summary: Ventana y estado de la prueba de un grupo de empresas
   *     description: |
   *       Devuelve el snapshot de la prueba de cada empresa listada en `ids`.
   *       Los identificadores que no existan (o estén dados de baja) no
   *       aparecen en la respuesta — no rechazan el lote completo.
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: ids
   *         required: true
   *         schema:
   *           type: string
   *           example: "uuid1,uuid2"
   *         description: Lista de businessUnitPublicId separados por coma.
   *     responses:
   *       '200':
   *         description: Arreglo de snapshots de prueba, uno por empresa encontrada
   *       '422':
   *         description: ids ausente o vacío
   *       '403':
   *         description: Sin permisos de administrador de plataforma. Respuesta del guard, sin campo code.
   *       '500':
   *         description: Falla no controlada al calcular el lote
   *
   * @index
   * @summary Ventana y estado de la prueba de un grupo de empresas
   * @description Snapshot de la prueba de cada empresa listada en `ids` (CSV). Las no encontradas se omiten.
   * @tag Platform · Prueba de tenants
   * @operationId getPlatformTenantTrialsBatch
   * @security [{"bearerAuth": []}]
   * @paramQuery ids - businessUnitPublicId separados por coma - string - required
   * @responseBody 200 - {"type": "success", "data": [{"businessUnitPublicId": "uuid", "businessUnitName": "Acme", "tuvoPrueba": false, "estado": "sin_prueba", "ventana": null, "diasContratados": null, "diasTranscurridos": null, "diasRestantes": null, "medicionHasta": null, "resultado": null}]}
   * @responseBody 422 - {"title": "No fue posible obtener la prueba del tenant", "detail": "ids no puede venir vacío.", "key": "no-fue-posible-obtener-la-prueba-del-tenant", "code": "PLT.MET.VAL_INPUT"}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 500 - {"title": "string", "detail": "string", "key": "error-inesperado-al-obtener-la-prueba-del-tenant", "code": "PLT.MET.SYS_UNHANDLED"}
   */
  async batch({ request, response }: HttpContext) {
    try {
      const { ids } = await request.validateUsing(tenantTrialBatchValidator, {
        messagesProvider: tenantTrialBatchValidatorMessages,
      })

      const businessUnitPublicIds = ids
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
        .slice(0, MAX_BATCH_IDS)

      const data = await this.service.resolveBatch(businessUnitPublicIds)
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformMetricApiError(
        error,
        TENANT_TRIAL_METRIC_ERROR_TEXTS
      )
      return response.status(httpStatus).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/tenant-trials/{businessUnitPublicId}:
   *   get:
   *     tags:
   *       - Platform · Prueba de tenants
   *     summary: Ventana y estado de la prueba de una empresa
   *     description: |
   *       Devuelve, de una sola empresa, cuál fue su prueba: de cuándo a
   *       cuándo corrió, cuántos días lleva, cuántos le quedan y si sigue
   *       viva o ya terminó. `sin_prueba` es una respuesta válida para quien
   *       nunca tuvo prueba, no un error.
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: businessUnitPublicId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Snapshot de la prueba de la empresa
   *       '404':
   *         description: Empresa no encontrada
   *       '403':
   *         description: Sin permisos de administrador de plataforma. Respuesta del guard, sin campo code.
   *       '500':
   *         description: Falla no controlada al resolver la prueba
   *
   * @index
   * @summary Ventana y estado de la prueba de una empresa
   * @description Snapshot único de la prueba de una empresa por su businessUnitPublicId.
   * @tag Platform · Prueba de tenants
   * @operationId getPlatformTenantTrialOne
   * @security [{"bearerAuth": []}]
   * @responseBody 200 - {"type": "success", "data": {"businessUnitPublicId": "uuid", "businessUnitName": "Acme", "tuvoPrueba": true, "estado": "terminada", "ventana": {"inicio": "2026-08-01", "fin": "2026-08-08"}, "diasContratados": 7, "diasTranscurridos": 7, "diasRestantes": 0, "medicionHasta": "2026-08-08", "resultado": null}}
   * @responseBody 404 - {"title": "No fue posible obtener la prueba del tenant", "detail": "La empresa solicitada no existe o no está disponible.", "key": "tenant-no-encontrado", "code": "PLT.MET.NOT_FOUND"}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 500 - {"title": "string", "detail": "string", "key": "error-inesperado-al-obtener-la-prueba-del-tenant", "code": "PLT.MET.SYS_UNHANDLED"}
   */
  async show({ params, response }: HttpContext) {
    try {
      const data = await this.service.resolveOne(params.businessUnitPublicId)
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformMetricApiError(
        error,
        TENANT_TRIAL_METRIC_ERROR_TEXTS
      )
      return response.status(httpStatus).json(body)
    }
  }
}
