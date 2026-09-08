import type { HttpContext } from '@adonisjs/core/http'
import PlatformMrrService from '#services/platform_mrr_service'
import {
  MRR_METRIC_ERROR_TEXTS,
  MRR_SERIES_METRIC_ERROR_TEXTS,
} from '../constants/platform_metric_error_codes.js'
import { resolvePlatformMetricApiError } from '../helpers/platform_metric_api_error.js'
import {
  mrrSeriesValidator,
  mrrSeriesValidatorMessages,
} from '../validators/platform_metric.js'

/**
 * Ingreso mensual recurrente de la plataforma en la consola GSTI
 * (USRH1788052455653 y USRH1788052455654).
 *
 * Publica dos superficies que NO son la misma métrica:
 *
 * - `index` → el ingreso CONTRATADO vigente hoy, en dos cifras que no se suman:
 *   el actual neto de las suscripciones activas y el proyectado de las de prueba.
 * - `series` → el ingreso COBRADO mes a mes, reconstruido desde los cobros que ya
 *   ocurrieron. Responde "cuánto entró" y no "cuánto tenemos contratado".
 *
 * Sus números no tienen por qué coincidir y el último punto de la serie
 * normalmente será distinto de la cifra de la franja. Los nombres de campo
 * (`mrrActualNetoCents` vs `mrrCobradoNetoCents`) llevan la diferencia encima a
 * propósito, y la serie declara además `criterio: 'pagos'` en su payload.
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

  /**
   * @swagger
   * /api/platform/metrics/mrr-series:
   *   get:
   *     tags:
   *       - Platform · Métricas
   *     summary: Serie mensual de ingreso recurrente COBRADO, reconstruida desde los pagos
   *     description: |
   *       Devuelve un valor por mes calendario con el ingreso recurrente atribuible a ese mes,
   *       reconstruido a partir de los cobros que el sistema ya registró. No hay proceso que
   *       tome fotos mensuales: la serie se calcula en el momento de la consulta sobre el
   *       desglose congelado de cada cobro, así que dice algo desde el primer día.
   *       ADVERTENCIA — esta serie NO es la misma métrica que GET /api/platform/metrics/mrr.
   *       Aquélla publica mrrActualNetoCents y mide ingreso CONTRATADO vigente hoy; ésta
   *       publica mrrCobradoNetoCents y mide ingreso COBRADO por el periodo que cada pago
   *       cubrió. Son dos preguntas distintas y sus números no tienen por qué coincidir: el
   *       último punto de la serie normalmente será distinto de la cifra de la franja, y eso
   *       es correcto, no un defecto. El payload lo declara con criterio: pagos y los nombres
   *       de campo llevan la diferencia encima a propósito.
   *       Cada cobro aporta su importe SIN IVA repartido en partes iguales entre los meses del
   *       periodo que cubrió: un cobro de tres meses aporta un tercio a cada uno en lugar de
   *       inflar el mes en que se pagó. El reparto usa división entera de centavos y el residuo
   *       no se atribuye a ningún mes.
   *       Los cobros sin periodo registrado NO se ubican en ningún mes —ni por la fecha de pago
   *       ni por ningún otro criterio—: quedan fuera y se informan en pagosSinPeriodoExcluidos.
   *       Un mes sin cobros atribuibles vale 0 y viene marcado de baja confiabilidad. Nunca se
   *       rellena con el mes anterior, con un promedio ni con una estimación. El mes en curso
   *       siempre viene de baja confiabilidad: está incompleto por definición y siempre se verá
   *       más bajo de lo que terminará siendo.
   *       La precedencia del motivo es mes-en-curso, después anterior-al-primer-pago y al final
   *       sin-pagos-en-el-mes: un mes en curso sin cobros se reporta como mes en curso.
   *       Si no existe ni un solo cobro con periodo registrado, la respuesta es 200 con
   *       puntos vacío y la ventana en null. NO se devuelve una lista de meses en cero.
   *       La ventana nunca arranca antes del mes del primer cobro con periodo y termina en el
   *       mes en curso. Quedan fuera los cobros de suscripciones borradas y de empresas
   *       borradas. Los importes van en centavos enteros y SIN IVA.
   *       Es un agregado de solo lectura: no publica empresas, identificadores internos ni
   *       información fiscal, y no escribe nada.
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: meses
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 24
   *           default: 12
   *         description: Ancho de la ventana en meses. Fuera de 1..24 o no entero responde 422.
   *     responses:
   *       '200':
   *         description: La serie mensual, su ventana y el conteo de cobros descartados
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
   *                     ventana:
   *                       type: object
   *                       description: |
   *                         Meses que la serie alcanza a reconstruir. desde nunca es anterior al
   *                         mes del primer cobro con periodo; hasta es el mes en curso. Ambos en
   *                         null cuando no hay ni un solo cobro con periodo.
   *                       properties:
   *                         desde:
   *                           type: string
   *                           nullable: true
   *                           example: "2026-01"
   *                         hasta:
   *                           type: string
   *                           nullable: true
   *                           example: "2026-09"
   *                     criterio:
   *                       type: string
   *                       enum: [pagos]
   *                       description: |
   *                         Fuente declarada en el propio payload. Marca que esta serie mide
   *                         ingreso COBRADO y no el contratado vigente de /metrics/mrr.
   *                     pagosSinPeriodoExcluidos:
   *                       type: integer
   *                       description: |
   *                         Cobros que no se pudieron ubicar en ningún mes por no tener periodo
   *                         registrado. Se informan; jamás se les asigna un mes a ojo.
   *                     puntos:
   *                       type: array
   *                       description: Un punto por mes, cronológico ascendente y sin huecos dentro de la ventana.
   *                       items:
   *                         type: object
   *                         properties:
   *                           mes:
   *                             type: string
   *                             example: "2026-04"
   *                           mrrCobradoNetoCents:
   *                             type: integer
   *                             description: |
   *                               Ingreso recurrente COBRADO atribuido al mes, SIN IVA, en centavos.
   *                               No es mrrActualNetoCents y no se espera que coincida con él.
   *                           pagosConsiderados:
   *                             type: integer
   *                             description: Cobros que aportaron a este mes. Un cobro de tres periodos cuenta en los tres.
   *                           confiabilidad:
   *                             type: string
   *                             enum: [alta, baja]
   *                           motivoBajaConfiabilidad:
   *                             type: string
   *                             nullable: true
   *                             enum: [mes-en-curso, sin-pagos-en-el-mes, anterior-al-primer-pago]
   *                             description: null cuando la confiabilidad es alta.
   *       '422':
   *         description: Ventana fuera de 1..24 o no entera
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: No fue posible obtener la serie mensual de MRR
   *                 detail:
   *                   type: string
   *                   example: El número de meses debe estar entre 1 y 24.
   *                 key:
   *                   type: string
   *                   example: no-fue-posible-obtener-la-serie-mensual-de-mrr
   *                 code:
   *                   type: string
   *                   example: PLT.MET.VAL_INPUT
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
   *         description: Falla no controlada al calcular la serie
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Error inesperado al obtener la serie mensual de MRR
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: error-inesperado-al-obtener-la-serie-mensual-de-mrr
   *                 code:
   *                   type: string
   *                   example: PLT.MET.SYS_UNHANDLED
   *
   * @series
   * @summary Serie mensual de ingreso recurrente COBRADO, reconstruida desde los pagos
   * @description Devuelve un valor por mes calendario con el ingreso recurrente atribuible a ese\
   *   mes, reconstruido desde los cobros ya registrados. Se calcula en el momento de la consulta:\
   *   sin fotos mensuales, sin caché y sin proceso programado.\
   *   ADVERTENCIA: NO es la misma métrica que GET /api/platform/metrics/mrr. Aquélla mide ingreso\
   *   CONTRATADO vigente hoy (mrrActualNetoCents); ésta mide ingreso COBRADO por periodo\
   *   (mrrCobradoNetoCents). Sus números no tienen por qué coincidir y el último punto de la serie\
   *   normalmente será distinto de la cifra de la franja. Eso es correcto, no un defecto.\
   *   Cada cobro aporta su importe SIN IVA repartido en partes iguales entre los meses que cubrió.\
   *   Los cobros sin periodo no se ubican en ningún mes: se excluyen y se cuentan.\
   *   Un mes sin cobros vale 0 y viene marcado; nunca se rellena con estimaciones. El mes en curso\
   *   siempre viene marcado porque está incompleto por definición.\
   *   Sin ningún cobro con periodo la respuesta es 200 con puntos vacío y ventana en null.\
   *   Quedan fuera los cobros de suscripciones y empresas borradas. Importes en centavos, SIN IVA.\
   *   Es un agregado: no publica empresas, identificadores internos ni información fiscal.
   * @tag Platform · Métricas
   * @operationId getPlatformMrrSeries
   * @security [{"bearerAuth": []}]
   * @paramQuery meses - Ancho de la ventana en meses, 1..24 (default 12) - integer
   * @responseBody 200 - {"type": "success", "data": {"ventana": {"desde": "2026-04", "hasta": "2026-09"}, "criterio": "pagos", "pagosSinPeriodoExcluidos": 2, "puntos": [{"mes": "2026-04", "mrrCobradoNetoCents": 100000, "pagosConsiderados": 1, "confiabilidad": "alta", "motivoBajaConfiabilidad": null}, {"mes": "2026-05", "mrrCobradoNetoCents": 0, "pagosConsiderados": 0, "confiabilidad": "baja", "motivoBajaConfiabilidad": "sin-pagos-en-el-mes"}, {"mes": "2026-09", "mrrCobradoNetoCents": 65000, "pagosConsiderados": 1, "confiabilidad": "baja", "motivoBajaConfiabilidad": "mes-en-curso"}]}}
   * @responseBody 422 - {"title": "No fue posible obtener la serie mensual de MRR", "detail": "El número de meses debe estar entre 1 y 24.", "key": "no-fue-posible-obtener-la-serie-mensual-de-mrr", "code": "PLT.MET.VAL_INPUT"}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 500 - {"title": "string", "detail": "string", "key": "error-inesperado-al-obtener-la-serie-mensual-de-mrr", "code": "PLT.MET.SYS_UNHANDLED"}
   */
  async series({ request, response }: HttpContext) {
    try {
      // Los mensajes van explícitos: el provider global de i18n solo se usa
      // cuando la llamada no trae el suyo, y sin esto el 422 saldría en inglés.
      const { meses } = await request.validateUsing(mrrSeriesValidator, {
        messagesProvider: mrrSeriesValidatorMessages,
      })

      // El 12 por omisión vive aquí y no en el validador, para que el default
      // esté en un solo lugar.
      const data = await this.service.getMonthlySeries(meses ?? 12)

      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformMetricApiError(
        error,
        MRR_SERIES_METRIC_ERROR_TEXTS
      )
      return response.status(httpStatus).json(body)
    }
  }
}
