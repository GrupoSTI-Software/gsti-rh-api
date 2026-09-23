import type { HttpContext } from '@adonisjs/core/http'
import PlatformTrialUsageService from '#services/platform_trial_usage_service'
import { TRIAL_USAGE_METRIC_ERROR_TEXTS } from '../constants/platform_metric_error_codes.js'
import { resolvePlatformMetricApiError } from '../helpers/platform_metric_api_error.js'

/**
 * Frecuencia de registro de la prueba de un tenant, con su serie diaria
 * (USRH1789079078171).
 *
 * Consulta de plataforma, sin pantalla: corre el mismo motor que el propio
 * cliente ve en su monitor de asistencia sobre el tramo medido de su prueba,
 * y distingue sin ambigüedad **sin base** (no hay a quién medir), **0 %**
 * (había a quién medir y nadie registró) y **fallo del cálculo** (500
 * dedicado, nunca un número bajo).
 */
export default class PlatformTrialUsageController {
  /**
   * @swagger
   * /api/platform/metrics/tenants/{publicId}/trial/usage:
   *   get:
   *     tags:
   *       - Platform · Prueba de tenants
   *     summary: Frecuencia de registro de la prueba de una empresa, con su serie diaria
   *     description: |
   *       Corre el motor de estadísticas de asistencia (el mismo que usa el
   *       cliente en su propio monitor) sobre el tramo medido de la prueba
   *       `[inicio, finEfectivo]` y traduce el resultado a tres lecturas que
   *       nunca se confunden: `con-base` (un porcentaje, que puede ser `0`),
   *       `sin-base` (no hay ningún empleado-día evaluable — nunca `0 %`) y
   *       fallo del cálculo, que se responde como error, nunca como un
   *       número bajo.
   *
   *       `ventana`, `frecuencia` y `serie` salen en `null`/`[]` cuando el
   *       tenant nunca tuvo prueba; el motor no se invoca en ese caso.
   *
   *       Limitaciones declaradas y no corregidas aquí: las tolerancias de
   *       retardo/falta con las que corre el motor son una sola configuración
   *       global (pueden ser las de GSTI aplicadas a todos los tenants, L-1);
   *       mientras siga viva la simulación de asistencia del recorrido
   *       guiado, sus checadas cuentan como presencia e inflan la frecuencia
   *       (L-2); un tenant con toda su plantilla marcada como no sujeta a
   *       asistencia sale `sin-base` aunque tenga gente (L-3).
   *
   *       Requiere sesión válida y `is_platform_admin = 1`.
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
   *         description: Uso de la prueba (frecuencia y serie diaria), o nulo si nunca tuvo prueba
   *       '404':
   *         description: Empresa no encontrada o borrada lógicamente
   *       '403':
   *         description: Sin permisos de administrador de plataforma. Respuesta del guard, sin campo code.
   *       '500':
   *         description: Falla del motor de asistencia o falla no controlada
   *
   * @index
   * @summary Frecuencia de registro de la prueba de una empresa, con su serie diaria
   * @description Corre el motor de asistencia sobre el tramo medido de la prueba y traduce el resultado a con-base/sin-base, nunca 0 en lugar de sin base. `ventana`/`frecuencia`/`serie` en null/[] sin prueba.
   * @tag Platform · Prueba de tenants
   * @operationId getPlatformTenantTrialUsage
   * @security [{"bearerAuth": []}]
   * @responseBody 200 - {"type": "success", "data": {"tenant": {"publicId": "3f2b…", "nombre": "Aceros del Norte"}, "ventana": {"inicio": "2026-09-01", "fin": "2026-09-05"}, "frecuencia": {"estado": "con-base", "porcentaje": 71.4, "registros": 15, "empleadoDiasEvaluables": 21, "empleadosEvaluados": 3}, "serie": [{"dia": "2026-09-01", "estado": "sin-base", "porcentaje": null, "registros": 0, "empleadoDiasEvaluables": 0, "empleadosEvaluados": 0}, {"dia": "2026-09-02", "estado": "con-base", "porcentaje": 66.7, "registros": 2, "empleadoDiasEvaluables": 3, "empleadosEvaluados": 3}]}}
   * @responseBody 404 - {"title": "No fue posible obtener el uso de la prueba", "detail": "La empresa solicitada no existe o no está disponible.", "key": "tenant-no-encontrado", "code": "PLT.MET.TENANT_NOT_FOUND"}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 500 - {"title": "No fue posible obtener el uso de la prueba", "detail": "No fue posible calcular el uso de la prueba en este momento.", "key": "no-fue-posible-obtener-el-uso-de-la-prueba", "code": "PLT.MET.USAGE_UNAVAILABLE"}
   */
  async show({ params, response, i18n }: HttpContext) {
    try {
      const service = new PlatformTrialUsageService(i18n)
      const data = await service.getTenantTrialUsage(params.publicId)
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformMetricApiError(
        error,
        TRIAL_USAGE_METRIC_ERROR_TEXTS
      )
      return response.status(httpStatus).json(body)
    }
  }
}
