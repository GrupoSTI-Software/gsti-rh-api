import type { HttpContext } from '@adonisjs/core/http'
import PlatformSubscriptionFlowService from '#services/platform_subscription_flow_service'
import { SUBSCRIPTION_FLOWS_METRIC_ERROR_TEXTS } from '../constants/platform_metric_error_codes.js'
import { resolvePlatformMetricApiError } from '../helpers/platform_metric_api_error.js'
import {
  subscriptionFlowsValidator,
  subscriptionFlowsValidatorMessages,
} from '../validators/platform_metric.js'

/**
 * Flujos de suscripción del mes en la consola GSTI (USRH1788052455656).
 *
 * Publica el movimiento de la cartera —altas, conversiones de prueba a pago,
 * cancelaciones y morosidad— del mes pedido y del inmediato anterior, con la
 * base de inicio de mes y las dos tasas. Todo se calcula al momento sobre lo
 * ya registrado: sin caché, sin cierre guardado y sin proceso programado.
 *
 * Sin `mes` responde el mes en curso marcado como parcial. Es un agregado: no
 * publica empresas, identificadores internos ni información fiscal.
 */
export default class PlatformSubscriptionFlowController {
  private readonly service = new PlatformSubscriptionFlowService()

  /**
   * @swagger
   * /api/platform/metrics/subscription-flows:
   *   get:
   *     tags:
   *       - Platform · Métricas
   *     summary: Altas, conversiones, cancelaciones y morosidad del mes contra el anterior
   *     description: |
   *       Devuelve el movimiento de la cartera de suscripciones del mes pedido y del
   *       mes calendario inmediato anterior, cada uno con sus cuatro movimientos, la
   *       base de inicio de mes y las dos tasas.
   *       Alta es la suscripción contratada en el mes; conversión es la que pasó de
   *       prueba a pagando en el mes por cualquiera de los dos caminos (reloj con
   *       periodo cubierto o primer pago), contada una sola vez; cancelación es la
   *       que trae fecha de cancelación en el mes —"baja" es lo mismo, no hay campo
   *       aparte—; morosidad es la que venció su periodo o su prueba sin pago en el
   *       mes, cliente vivo, no baja. Las tasas dividen entre la base de inicio de
   *       mes con un decimal, y valen 0 sin base. Un mes sin movimiento responde
   *       ceros, nunca error. El mes en curso responde parcial con los días.
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: mes
   *         required: false
   *         schema:
   *           type: string
   *           example: "2026-08"
   *         description: Mes pedido `YYYY-MM`. Omitido = mes en curso. Futuro = 422.
   *     responses:
   *       '200':
   *         description: Los dos periodos, la parcialidad y los días
   *       '422':
   *         description: Mes mal formado o futuro
   *       '403':
   *         description: Sin permisos de administrador de plataforma. Respuesta del guard, sin campo code.
   *       '500':
   *         description: Falla no controlada al calcular los flujos
   *
   * @index
   * @summary Altas, conversiones, cancelaciones y morosidad del mes contra el anterior
   * @description Movimiento de la cartera del mes pedido y el anterior, con base y tasas.\
   *   Solo lectura, calculado al momento. Es un agregado sin empresas ni identificadores.
   * @tag Platform · Métricas
   * @operationId getPlatformSubscriptionFlows
   * @security [{"bearerAuth": []}]
   * @paramQuery mes - Mes pedido `YYYY-MM` (omitido = en curso) - string
   * @responseBody 200 - {"type": "success", "data": {"mes": "2026-08", "mesAnterior": "2026-07", "parcial": false, "diasTranscurridos": null, "diasDelMes": null, "actual": {"altas": 2, "conversiones": 2, "cancelaciones": 1, "morosidad": 1, "suscripcionesInicioMes": 40, "tasaCancelacionPct": 2.5, "tasaMorosidadPct": 2.5}, "anterior": {"altas": 0, "conversiones": 0, "cancelaciones": 0, "morosidad": 0, "suscripcionesInicioMes": 0, "tasaCancelacionPct": 0, "tasaMorosidadPct": 0}}}
   * @responseBody 422 - {"title": "No fue posible obtener los flujos de suscripción", "detail": "El mes debe tener el formato AAAA-MM.", "key": "no-fue-posible-obtener-los-flujos-de-suscripcion", "code": "PLT.MET.VAL_INPUT"}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 500 - {"title": "string", "detail": "string", "key": "error-inesperado-al-obtener-los-flujos-de-suscripcion", "code": "PLT.MET.SYS_UNHANDLED"}
   */
  async index({ request, response }: HttpContext) {
    try {
      // Los mensajes van explícitos: el provider global de i18n solo se usa
      // cuando la llamada no trae el suyo, y sin esto el 422 saldría en inglés.
      const { mes } = await request.validateUsing(subscriptionFlowsValidator, {
        messagesProvider: subscriptionFlowsValidatorMessages,
      })

      const data = await this.service.getSubscriptionFlows(mes ?? undefined)

      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformMetricApiError(
        error,
        SUBSCRIPTION_FLOWS_METRIC_ERROR_TEXTS
      )
      return response.status(httpStatus).json(body)
    }
  }
}
