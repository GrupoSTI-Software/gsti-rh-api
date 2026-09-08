import type { HttpContext } from '@adonisjs/core/http'
import PlatformMrrService from '#services/platform_mrr_service'
import { MRR_METRIC_ERROR_TEXTS } from '../constants/platform_metric_error_codes.js'
import { resolvePlatformMetricApiError } from '../helpers/platform_metric_api_error.js'

/**
 * Ingreso mensual recurrente de la plataforma en la consola GSTI
 * (USRH1788052455653).
 *
 * Solo lectura y sin parámetros. Publica dos cifras que **no se suman**: el MRR
 * actual neto —lo que ya está contratado y activo, con los descuentos aplicados
 * y sin IVA— y el proyectado de las suscripciones en prueba, que es lo que
 * sumaría si convierten. Ningún campo de la respuesta es su suma.
 */
export default class PlatformMrrController {
  private readonly service = new PlatformMrrService()

  /**
   * @swagger
   * /api/platform/metrics/mrr:
   *   get:
   *     tags:
   *       - Platform · Métricas
   *     summary: Ingreso mensual recurrente actual neto y proyectado de pruebas
   *     description: |
   *       Devuelve el ingreso mensual recurrente de toda la plataforma en dos cifras
   *       independientes: el actual neto, que suma el importe contratado SIN IVA de las
   *       suscripciones active, y el proyectado, que suma el mismo importe de las
   *       suscripciones trialing.
   *       Las dos viajan aparte y ningún campo de esta respuesta es —ni podrá ser— su suma:
   *       el actual es lo que ya está contratado, el proyectado es lo que sumaría si las
   *       pruebas convierten, y presentarlas juntas sobreestimaría el ingreso.
   *       El importe de cada suscripción es el que quedó sellado en el trato vigente, con
   *       su descuento ya aplicado: nunca se recalcula desde el porcentaje de descuento,
   *       porque el catálogo admite descuentos que no son porcentaje y recalcular
   *       reportaría el precio de lista sin que nada falle.
   *       Las suscripciones con pago vencido (past_due) quedan FUERA de las dos cifras: su
   *       importe se reporta en la cartera vencida. La consecuencia es explícita y aceptada
   *       — el ingreso mensual recurrente BAJA cuando un cliente cae en morosidad y vuelve
   *       a subir cuando se pone al corriente.
   *       Se suman todas las suscripciones de cada estado, no una por empresa: una empresa
   *       con dos suscripciones vivas aporta las dos. Es distinto del listado de tenants,
   *       que elige una suscripción por empresa; ésa es regla de despliegue, no de ingreso.
   *       Quedan fuera las suscripciones borradas y las de empresas borradas. Una empresa
   *       desactivada pero no borrada SÍ cuenta: manda el estado de la suscripción.
   *       Las dos cifras van sin impuestos, al revés que la deuda vencida, que va con IVA.
   *       monedas informa cuántas suscripciones hay por moneda contratada: la suma NO se
   *       agrupa por moneda, es un supuesto declarado y más de un elemento significa que la
   *       cifra cruza monedas.
   *       Se resuelve en el momento de la consulta: sin caché, sin cierre guardado y sin
   *       proceso programado. Es un agregado: no publica empresas, identificadores internos
   *       ni información fiscal.
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Las dos cifras de ingreso recurrente, sus conteos y el reparto por moneda
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
   *                     mrrActualNetoCents:
   *                       type: integer
   *                       description: |
   *                         Suma del importe contratado SIN IVA de las suscripciones active, en
   *                         centavos. Ya viene con el descuento de cada cliente aplicado.
   *                         Baja cuando un cliente cae en past_due: ese importe se reporta en la
   *                         cartera vencida, no aquí.
   *                     suscripcionesActivas:
   *                       type: integer
   *                       description: Suscripciones active sumadas. No es un conteo de empresas.
   *                     mrrProyectadoTrialCents:
   *                       type: integer
   *                       description: |
   *                         Misma suma sobre las suscripciones trialing, en centavos. NO está
   *                         incluida en mrrActualNetoCents y no existe ningún campo que las sume.
   *                     suscripcionesEnPrueba:
   *                       type: integer
   *                     monedas:
   *                       type: array
   *                       description: |
   *                         Reparto por moneda contratada sobre el universo active + trialing.
   *                         Informativo: la suma no se agrupa por moneda. Más de un elemento
   *                         significa que la cifra cruza monedas y la vista lo advierte.
   *                       items:
   *                         type: object
   *                         properties:
   *                           codigo:
   *                             type: string
   *                             example: MXN
   *                           suscripciones:
   *                             type: integer
   *                     calculadoAl:
   *                       type: string
   *                       format: date
   *                       example: "2026-09-08"
   *       '403':
   *         description: Sin permisos de administrador de plataforma. Respuesta del guard, sin campo code.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Acceso restringido a plataforma
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: AUTH.PLATFORM.FORBIDDEN
   *       '500':
   *         description: Falla no controlada al calcular el ingreso recurrente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Error inesperado al obtener el ingreso mensual recurrente
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: error-inesperado-al-obtener-el-ingreso-mensual-recurrente
   *                 code:
   *                   type: string
   *                   example: PLT.MET.SYS_UNHANDLED
   *
   * @index
   * @summary Ingreso mensual recurrente actual neto y proyectado de pruebas
   * @description Devuelve el ingreso mensual recurrente de toda la plataforma en dos cifras\
   *   independientes: el actual neto, que suma el importe contratado SIN IVA de las\
   *   suscripciones active, y el proyectado de las suscripciones trialing.\
   *   Ningún campo de la respuesta es —ni podrá ser— su suma: presentarlas juntas\
   *   sobreestimaría el ingreso.\
   *   El importe de cada suscripción es el sellado en el trato vigente, con su descuento ya\
   *   aplicado; nunca se recalcula desde el porcentaje de descuento.\
   *   Las suscripciones past_due quedan fuera de las dos cifras: su importe se reporta en la\
   *   cartera vencida. Consecuencia aceptada: el MRR baja cuando un cliente cae en morosidad\
   *   y vuelve a subir cuando se pone al corriente.\
   *   Se suman todas las suscripciones de cada estado, no una por empresa.\
   *   Borradas fuera; empresa desactivada pero no borrada sí cuenta.\
   *   Las dos cifras van SIN impuestos, al revés que la deuda vencida.\
   *   Se resuelve en el momento de la consulta, sin caché ni proceso programado.\
   *   Es un agregado: no publica empresas, identificadores internos ni información fiscal.
   * @tag Platform · Métricas
   * @operationId getPlatformMrr
   * @security [{"bearerAuth": []}]
   * @responseBody 200 - {"type": "success", "data": {"mrrActualNetoCents": 1250000, "suscripcionesActivas": 4, "mrrProyectadoTrialCents": 200000, "suscripcionesEnPrueba": 1, "monedas": [{"codigo": "MXN", "suscripciones": 5}], "calculadoAl": "2026-09-08"}}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 500 - {"title": "string", "detail": "string", "key": "error-inesperado-al-obtener-el-ingreso-mensual-recurrente", "code": "PLT.MET.SYS_UNHANDLED"}
   */
  async index({ response }: HttpContext) {
    try {
      // Sin `request.validateUsing`: el endpoint no recibe entrada, así que no
      // hay 422 propio y no se le inventa un validador vacío.
      const data = await this.service.getMrrSnapshot()

      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformMetricApiError(
        error,
        MRR_METRIC_ERROR_TEXTS
      )
      return response.status(httpStatus).json(body)
    }
  }
}
