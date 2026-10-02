import type { HttpContext } from '@adonisjs/core/http'
import PlatformConsentError from '#exceptions/platform_consent_error'
import { PLATFORM_CONSENT_ERROR_CODES_BY_KEY } from '#constants/platform_consent_error_codes'
import { PLATFORM_ACCEPTANCES_DEFAULT_LIMIT } from '#modules/consent/platform/platform_consent.constants'
import PlatformConsentService from '#modules/consent/platform/platform_consent.service'
import { listPlatformLegalAcceptancesValidator } from '#modules/consent/platform/validators/list_platform_legal_acceptances.validator'

type ListPayload = Awaited<ReturnType<typeof listPlatformLegalAcceptancesValidator.validate>>

/**
 * Aceptaciones legales de plataforma por empresa (USRH1790610965452).
 *
 * Solo lectura: estado de aceptación de Términos y Aviso de privacidad por tenant.
 * Requiere sesión de consola de plataforma (`auth` + `platformAdmin`).
 */
export default class PlatformConsentController {
  /**
   * @swagger
   * /api/platform/legal-acceptances:
   *   get:
   *     tags:
   *       - Platform · Legal Acceptances
   *     summary: Estado de aceptación de Términos y Aviso por empresa
   *     description: |
   *       Devuelve el listado paginado de empresas con el estado de aceptación de la versión
   *       vigente de Términos y condiciones y del Aviso de privacidad. La empresa cuenta como
   *       "aceptó" cuando una cuenta con rol owner de esa empresa aceptó la versión vigente.
   *       El estado por documento es `al-dia`, `pendiente`, `nunca` o `sin-version-publicada`
   *       (cuando el tipo no tiene versión vigente). `currentVersions` trae la versión vigente
   *       de cada documento, o null si no hay.
   *       El parámetro search acepta nombre comercial, nombre legal o un RFC completo válido
   *       ante el SAT (resuelve por huella ciega); el RFC nunca se devuelve.
   *       Solo lectura. Requiere sesión válida de consola y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: search
   *         required: false
   *         schema:
   *           type: string
   *           minLength: 1
   *           maxLength: 191
   *         description: Filtro sobre nombre comercial, nombre legal registrado o RFC completo válido SAT
   *       - in: query
   *         name: status
   *         required: false
   *         schema:
   *           type: string
   *           enum: [al-dia, pendiente, nunca]
   *         description: Filtro por estado de aceptación (no acepta sin-version-publicada)
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
   *         description: Listado paginado de empresas con su estado de aceptación
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 currentVersions:
   *                   type: object
   *                   properties:
   *                     termsConditions:
   *                       type: object
   *                       nullable: true
   *                       properties:
   *                         version:
   *                           type: string
   *                         publishedAt:
   *                           type: string
   *                           nullable: true
   *                     privacyNotice:
   *                       type: object
   *                       nullable: true
   *                       properties:
   *                         version:
   *                           type: string
   *                         publishedAt:
   *                           type: string
   *                           nullable: true
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       businessUnitPublicId:
   *                         type: string
   *                         format: uuid
   *                       businessUnitName:
   *                         type: string
   *                       termsConditions:
   *                         type: object
   *                         properties:
   *                           status:
   *                             type: string
   *                             enum: [al-dia, pendiente, nunca, sin-version-publicada]
   *                           lastAcceptedAt:
   *                             type: string
   *                             nullable: true
   *                       privacyNotice:
   *                         type: object
   *                         properties:
   *                           status:
   *                             type: string
   *                             enum: [al-dia, pendiente, nunca, sin-version-publicada]
   *                           lastAcceptedAt:
   *                             type: string
   *                             nullable: true
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
   *       '401':
   *         description: Sin sesión válida (respuesta existente del middleware auth; title, detail, key y refreshable varían según el motivo — token ausente, inválido, expirado o revocado)
   *       '403':
   *         description: Sin permisos de administrador de plataforma
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
   *       '422':
   *         description: Filtros de consulta inválidos
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                   example: Filtros de aceptaciones inválidos
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: filtros-de-aceptaciones-invalidos
   *                 code:
   *                   type: string
   *                   example: CONSENT.PLATFORM.001
   *
   * @index
   * @summary Estado de aceptación de Términos y Aviso por empresa
   * @description Devuelve el listado paginado de empresas con el estado de aceptación de la\
   *   versión vigente de Términos y del Aviso de privacidad (al-dia, pendiente, nunca o\
   *   sin-version-publicada). currentVersions trae la versión vigente de cada documento.\
   *   Solo lectura; nunca expone RFC ni datos de las cuentas que aceptaron.
   * @tag Platform · Legal Acceptances
   * @operationId listPlatformLegalAcceptances
   * @security [{"bearerAuth": []}]
   * @paramQuery search - Filtro sobre nombre comercial, nombre legal registrado o RFC completo válido SAT - string
   * @paramQuery status - Filtro por estado de aceptación (al-dia|pendiente|nunca) - string
   * @paramQuery page - Página (default 1) - integer
   * @paramQuery limit - Resultados por página, máx 100 (default 20) - integer
   * @responseBody 200 - {"type": "success", "currentVersions": {"termsConditions": {"version": "2.0", "publishedAt": "2026-09-01T12:00:00.000-06:00"}, "privacyNotice": null}, "data": [{"businessUnitPublicId": "5f1c2a…", "businessUnitName": "Acme", "termsConditions": {"status": "pendiente", "lastAcceptedAt": "2026-03-10T09:15:00.000-06:00"}, "privacyNotice": {"status": "sin-version-publicada", "lastAcceptedAt": null}}], "meta": {"total": 1, "page": 1, "limit": 20, "lastPage": 1}}
   * @responseBody 401 - {"type": "warning", "title": "Token requerido", "detail": "No se envió un access token válido", "message": "No se envió un access token válido", "key": "AUTH.TOKEN.MISSING", "data": {"refreshable": false}}
   * @responseBody 403 - {"title": "Acceso restringido a plataforma", "detail": "Esta sección es exclusiva de administradores de plataforma.", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 422 - {"type": "error", "title": "Filtros de aceptaciones inválidos", "detail": "string", "key": "filtros-de-aceptaciones-invalidos", "code": "CONSENT.PLATFORM.001"}
   */
  async index(ctx: HttpContext, service: PlatformConsentService = new PlatformConsentService()) {
    const { response } = ctx

    try {
      const { search, status, page, limit } = await this.validateQuery(ctx)
      const result = await service.listLegalAcceptances({
        search,
        status,
        page: page ?? 1,
        limit: limit ?? PLATFORM_ACCEPTANCES_DEFAULT_LIMIT,
      })
      return response.status(200).json(result)
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * Valida los query params. Cualquier error de VineJS se traduce al error de dominio
   * `filtros-de-aceptaciones-invalidos`; lo que no sea `E_VALIDATION_ERROR` se relanza.
   */
  private async validateQuery({ request }: HttpContext): Promise<ListPayload> {
    try {
      return await request.validateUsing(listPlatformLegalAcceptancesValidator)
    } catch (error) {
      if (this.isValidationError(error)) {
        throw new PlatformConsentError('filtros-de-aceptaciones-invalidos')
      }
      throw error
    }
  }

  private isValidationError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'E_VALIDATION_ERROR'
    )
  }

  private domainError({ response, i18n }: HttpContext, error: unknown) {
    if (error instanceof PlatformConsentError) {
      return response.status(422).json({
        type: 'error',
        title: i18n.formatMessage(`platformLegalAcceptances.errors.${error.key}.title`),
        detail: i18n.formatMessage(`platformLegalAcceptances.errors.${error.key}.detail`),
        key: error.key,
        code: PLATFORM_CONSENT_ERROR_CODES_BY_KEY[error.key],
      })
    }
    throw error
  }
}
