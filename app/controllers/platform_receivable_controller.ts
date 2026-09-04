import type { HttpContext } from '@adonisjs/core/http'
import PlatformReceivableService from '#services/platform_receivable_service'
import {
  listReceivablesValidator,
  receivablesValidatorMessages,
} from '#validators/platform_metric'
import { RECEIVABLES_METRIC_ERROR_TEXTS } from '../constants/platform_metric_error_codes.js'
import { resolvePlatformMetricApiError } from '../helpers/platform_metric_api_error.js'

/**
 * Cartera vencida de la plataforma en la consola GSTI (USRH1788052455651).
 *
 * Solo lectura. Publica el total vencido y el reparto por antigüedad sobre la
 * cartera completa, más el detalle paginado por empresa morosa.
 */
export default class PlatformReceivableController {
  private readonly service = new PlatformReceivableService()

  /**
   * @swagger
   * /api/platform/metrics/receivables:
   *   get:
   *     tags:
   *       - Platform · Métricas
   *     summary: Cartera vencida con total, antigüedad de saldos y detalle por empresa
   *     description: |
   *       Devuelve el total vencido de toda la plataforma, su reparto en tres tramos de
   *       antigüedad y el detalle paginado de las empresas morosas.
   *       La cartera son exclusivamente las suscripciones en estado past_due, vivas y de
   *       empresas vivas: al corriente, en prueba y canceladas quedan fuera aunque deban.
   *       El importe publicado es el total contratado CON IVA — lo que la empresa debe pagar,
   *       no el ingreso de la plataforma — y cada morosa aporta un solo periodo: lo que crece
   *       con el tiempo son los días de atraso, no el importe.
   *       El resumen se calcula siempre sobre la cartera completa, nunca sobre la página.
   *       El saldo a favor viaja aparte y jamás se resta del adeudo.
   *       Se resuelve en el momento de la consulta: sin caché, sin proceso nocturno y sin
   *       tabla intermedia. Nunca expone el identificador interno de la empresa ni datos fiscales.
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *           default: 1
   *       - in: query
   *         name: limit
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *     responses:
   *       '200':
   *         description: Resumen de la cartera vencida y página de empresas morosas
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
   *                     resumen:
   *                       type: object
   *                       properties:
   *                         totalVencidoCents:
   *                           type: integer
   *                           description: Suma de toda la cartera en centavos, con IVA. No es la suma de la página.
   *                         tenantsVencidos:
   *                           type: integer
   *                         saldoAFavorCents:
   *                           type: integer
   *                           description: Informativo. No se resta del adeudo.
   *                         porBucket:
   *                           type: object
   *                           description: Reparto por antigüedad. Un tramo sin morosos se publica en cero, no se omite.
   *                           properties:
   *                             hasta30:
   *                               type: object
   *                               properties:
   *                                 tenants:
   *                                   type: integer
   *                                 montoCents:
   *                                   type: integer
   *                             de31a60:
   *                               type: object
   *                               properties:
   *                                 tenants:
   *                                   type: integer
   *                                 montoCents:
   *                                   type: integer
   *                             mas60:
   *                               type: object
   *                               properties:
   *                                 tenants:
   *                                   type: integer
   *                                 montoCents:
   *                                   type: integer
   *                         calculadoAl:
   *                           type: string
   *                           format: date
   *                           example: "2026-09-02"
   *                     tenants:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           businessUnitPublicId:
   *                             type: string
   *                             format: uuid
   *                           businessUnitName:
   *                             type: string
   *                           businessUnitActive:
   *                             type: integer
   *                             description: 0 cuando la empresa está desactivada. No la excluye de la cartera.
   *                           planName:
   *                             type: string
   *                             nullable: true
   *                           montoVencidoCents:
   *                             type: integer
   *                           diasAtraso:
   *                             type: integer
   *                           bucket:
   *                             type: string
   *                             enum: [hasta30, de31a60, mas60]
   *                           periodoFin:
   *                             type: string
   *                             format: date
   *                           saldoAFavorCents:
   *                             type: integer
   *                 meta:
   *                   type: object
   *                   properties:
   *                     total:
   *                       type: integer
   *                     page:
   *                       type: integer
   *                     limit:
   *                       type: integer
   *                     lastPage:
   *                       type: integer
   *       '422':
   *         description: Parámetros de consulta inválidos
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: No fue posible obtener la cartera vencida
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: no-fue-posible-obtener-la-cartera-vencida
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
   *
   * @index
   * @summary Cartera vencida con total, antigüedad de saldos y detalle por empresa
   * @description Devuelve el total vencido de toda la plataforma, su reparto en tres tramos\
   *   de antigüedad y el detalle paginado de las empresas morosas.\
   *   La cartera son exclusivamente las suscripciones en past_due, vivas y de empresas vivas.\
   *   El importe publicado es el total contratado CON IVA y cada morosa aporta un solo periodo.\
   *   El resumen se calcula sobre la cartera completa, nunca sobre la página.\
   *   El saldo a favor viaja aparte y jamás se resta del adeudo.\
   *   Solo lectura; nunca expone el identificador interno de la empresa ni datos fiscales.
   * @tag Platform · Métricas
   * @operationId getPlatformReceivables
   * @security [{"bearerAuth": []}]
   * @paramQuery page - Página (default 1) - integer
   * @paramQuery limit - Resultados por página, máx 100 (default 20) - integer
   * @responseBody 200 - {"type": "success", "data": {"resumen": {"totalVencidoCents": 580000, "tenantsVencidos": 1, "saldoAFavorCents": 100000, "porBucket": {"hasta30": {"tenants": 1, "montoCents": 580000}, "de31a60": {"tenants": 0, "montoCents": 0}, "mas60": {"tenants": 0, "montoCents": 0}}, "calculadoAl": "2026-09-02"}, "tenants": [{"businessUnitPublicId": "uuid", "businessUnitName": "Empresa Demo", "businessUnitActive": 1, "planName": "Plan Pro", "montoVencidoCents": 580000, "diasAtraso": 12, "bucket": "hasta30", "periodoFin": "2026-08-21", "saldoAFavorCents": 100000}]}, "meta": {"total": 1, "page": 1, "limit": 20, "lastPage": 1}}
   * @responseBody 422 - {"title": "No fue posible obtener la cartera vencida", "detail": "El límite de resultados por página no puede ser mayor a 100.", "key": "no-fue-posible-obtener-la-cartera-vencida", "code": "PLT.MET.VAL_INPUT"}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 500 - {"title": "string", "detail": "string", "key": "error-inesperado-al-obtener-la-cartera-vencida", "code": "PLT.MET.SYS_UNHANDLED"}
   */
  async index({ request, response }: HttpContext) {
    try {
      // Los mensajes van explícitos: el provider global de i18n solo se usa
      // cuando la llamada no trae el suyo, y sin esto el 422 saldría en inglés.
      const { page, limit } = await request.validateUsing(listReceivablesValidator, {
        messagesProvider: receivablesValidatorMessages,
      })

      const result = await this.service.listReceivables({
        page: page ?? 1,
        limit: limit ?? 20,
      })

      return response.status(200).json({ type: 'success', ...result })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformMetricApiError(
        error,
        RECEIVABLES_METRIC_ERROR_TEXTS
      )
      return response.status(httpStatus).json(body)
    }
  }
}
