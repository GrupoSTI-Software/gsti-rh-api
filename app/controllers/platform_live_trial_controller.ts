import type { HttpContext } from '@adonisjs/core/http'
import PlatformLiveTrialService from '#services/platform_live_trial_service'
import { LIVE_TRIALS_METRIC_ERROR_TEXTS } from '../constants/platform_metric_error_codes.js'
import { resolvePlatformMetricApiError } from '../helpers/platform_metric_api_error.js'

/**
 * Listado de todas las pruebas vivas, con sus hitos cumplidos y su
 * frecuencia de registro (USRH1789079078173).
 *
 * Consulta de plataforma, sin pantalla: junta, por empresa, la ventana de la
 * prueba (USRH1789079078169), los siete hitos de puesta en marcha
 * (USRH1789079078170) y la frecuencia de registro (USRH1789079078171),
 * ordenada por quién necesita más ayuda — sin el recorte de 7 días ni el
 * tope de 100 empresas que arrastra la tarjeta actual del Panel.
 */
export default class PlatformLiveTrialController {
  /**
   * @swagger
   * /api/platform/metrics/trials/live:
   *   get:
   *     tags:
   *       - Platform · Prueba de tenants
   *     summary: Listado de todas las pruebas vivas, con hitos y frecuencia
   *     description: |
   *       Devuelve TODAS las pruebas en curso (sin umbral de días, sin tope
   *       de cantidad), cada una con el nombre y el identificador público de
   *       su empresa, su fecha de fin, sus días restantes, cuántos de los
   *       siete hitos de puesta en marcha lleva cumplidos hoy (y de cuántos
   *       en total) y su frecuencia de registro.
   *
   *       Orden: primero las empresas `sin-base` (no hay a quién medir);
   *       después las `con-base`, de menor a mayor porcentaje; al final las
   *       `no-disponible` (falló el cálculo de esa fila). Dentro de cada
   *       grupo, primero la que vence antes; el desempate final es el
   *       identificador público, ascendente (sin significado comercial, solo
   *       para que dos cargas seguidas den el mismo orden). Los hitos
   *       cumplidos NUNCA alteran el orden — solo informan.
   *
   *       El fallo del cálculo de frecuencia de UNA empresa marca esa fila
   *       como `no-disponible` y el listado responde 200 igual — una empresa
   *       rota nunca deja ciego sobre las demás. Solo un fallo del universo
   *       de pruebas o de los hitos en lote (algo que rompe TODA la lista)
   *       responde 500.
   *
   *       Sin pruebas vivas, responde `{"total":0,"pruebas":[]}`, no un error.
   *
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Listado de pruebas vivas, ordenado por quién necesita más ayuda (puede venir vacío)
   *       '403':
   *         description: Sin permisos de administrador de plataforma. Respuesta del guard, sin campo code.
   *       '500':
   *         description: Falla del universo de pruebas o de los hitos en lote
   *
   * @index
   * @summary Listado de todas las pruebas vivas, con hitos y frecuencia
   * @description Junta ventana, hitos y frecuencia de TODAS las pruebas en curso, ordenadas por quién necesita más ayuda. El fallo de una empresa no tumba el listado.
   * @tag Platform · Prueba de tenants
   * @operationId getPlatformLiveTrials
   * @security [{"bearerAuth": []}]
   * @responseBody 200 - {"type": "success", "data": {"total": 1, "pruebas": [{"tenant": {"publicId": "3f2b…", "nombre": "Aceros del Norte"}, "fin": "2026-10-01", "diasRestantes": 5, "hitosCumplidos": 3, "hitosTotales": 7, "frecuencia": {"estado": "con-base", "porcentaje": 40.0}}]}}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 500 - {"title": "Error inesperado al obtener las pruebas vivas", "detail": "string", "key": "error-inesperado-al-obtener-las-pruebas-vivas", "code": "PLT.MET.SYS_UNHANDLED"}
   */
  async index({ response, i18n }: HttpContext) {
    try {
      const service = new PlatformLiveTrialService(i18n)
      const data = await service.listLiveTrials()
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformMetricApiError(
        error,
        LIVE_TRIALS_METRIC_ERROR_TEXTS
      )
      return response.status(httpStatus).json(body)
    }
  }
}
