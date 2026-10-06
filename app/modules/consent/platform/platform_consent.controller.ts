import type { HttpContext } from '@adonisjs/core/http'
import PlatformConsentError from '#exceptions/platform_consent_error'
import { PLATFORM_CONSENT_ERROR_CODES_BY_KEY } from '#constants/platform_consent_error_codes'
import { PLATFORM_ACCEPTANCES_DEFAULT_LIMIT } from '#modules/consent/platform/platform_consent.constants'
import PlatformConsentService from '#modules/consent/platform/platform_consent.service'
import { listPlatformLegalAcceptancesValidator } from '#modules/consent/platform/validators/list_platform_legal_acceptances.validator'
import {
  platformTenantLegalAcceptancesParamsValidator,
  platformTenantLegalAcceptancesQueryValidator,
  type TenantHistoryParamsPayload,
  type TenantHistoryQueryPayload,
} from '#modules/consent/platform/validators/platform_tenant_legal_acceptances.validator'

type ListPayload = Awaited<ReturnType<typeof listPlatformLegalAcceptancesValidator.validate>>

/**
 * Aceptaciones legales de plataforma por empresa (USRH1790610965452; historial por
 * tenant en USRH1790610965466).
 *
 * Solo lectura: estado de aceptación de Términos y Aviso de privacidad por tenant y el
 * historial paginado de aceptaciones de una empresa. Requiere sesión de consola de
 * plataforma (`auth` + `platformAdmin`).
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
   * @swagger
   * /api/platform/tenants/{businessUnitPublicId}/legal-acceptances:
   *   get:
   *     tags:
   *       - Platform · Legal Acceptances
   *     summary: Historial de aceptaciones de Términos y Aviso de una empresa
   *     description: |
   *       Devuelve el historial paginado de aceptaciones de Términos y condiciones y del
   *       Aviso de privacidad de todas las personas de una empresa, identificada por su
   *       `businessUnitPublicId` (UUID). Cada fila es una aceptación con su persona,
   *       documento, versión, fecha, canal y si la persona es propietaria de la empresa.
   *       La IP y el user agent se devuelven **siempre** enmascarados (máscara fija
   *       `•••••`): el endpoint no admite revelado y cualquier llave extra del query
   *       (p. ej. `reveal`) se ignora. El consentimiento biométrico no forma parte del
   *       historial. Solo lectura. Requiere sesión válida de consola y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: businessUnitPublicId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Identificador público (UUID) de la empresa
   *       - in: query
   *         name: page
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *           default: 1
   *       - in: query
   *         name: perPage
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *     responses:
   *       '200':
   *         description: Historial paginado de aceptaciones de la empresa
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 tenant:
   *                   type: object
   *                   properties:
   *                     businessUnitPublicId:
   *                       type: string
   *                       format: uuid
   *                     businessUnitName:
   *                       type: string
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       userConsentId:
   *                         type: integer
   *                       userName:
   *                         type: string
   *                       isOwner:
   *                         type: boolean
   *                       documentType:
   *                         type: string
   *                         enum: [terms_conditions, privacy_notice]
   *                       version:
   *                         type: string
   *                       acceptedAt:
   *                         type: string
   *                         nullable: true
   *                       channel:
   *                         type: string
   *                         enum: [digital, physical]
   *                       ip:
   *                         type: string
   *                         nullable: true
   *                       userAgent:
   *                         type: string
   *                         nullable: true
   *                 meta:
   *                   type: object
   *                   properties:
   *                     total:
   *                       type: integer
   *                     perPage:
   *                       type: integer
   *                     currentPage:
   *                       type: integer
   *                     lastPage:
   *                       type: integer
   *       '401':
   *         description: Sin sesión válida (respuesta existente del middleware auth)
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
   *       '404':
   *         description: La empresa no existe o está borrada
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
   *                   example: Empresa no encontrada
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: empresa-no-encontrada
   *                 code:
   *                   type: string
   *                   example: CONSENT.PLATFORM.010
   *       '422':
   *         description: Parámetros de ruta o paginación inválidos
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
   *                   example: Parámetros de historial inválidos
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: parametros-de-historial-invalidos
   *                 code:
   *                   type: string
   *                   example: CONSENT.PLATFORM.011
   *
   * @index
   * @summary Historial de aceptaciones de Términos y Aviso de una empresa
   * @description Devuelve el historial paginado de aceptaciones de Términos y del Aviso de\
   *   privacidad de todas las personas de una empresa. La IP y el user agent se devuelven\
   *   siempre enmascarados (•••••); el endpoint no admite revelado. El consentimiento\
   *   biométrico no forma parte del historial. Solo lectura.
   * @tag Platform · Legal Acceptances
   * @operationId getTenantLegalAcceptanceHistory
   * @security [{"bearerAuth": []}]
   * @paramPath businessUnitPublicId - Identificador público (UUID) de la empresa - string
   * @paramQuery page - Página (default 1) - integer
   * @paramQuery perPage - Resultados por página, máx 100 (default 20) - integer
   * @responseBody 200 - {"type": "success", "tenant": {"businessUnitPublicId": "5f1c2a…", "businessUnitName": "Acme"}, "data": [{"userConsentId": 812, "userName": "Ana Pérez López", "isOwner": true, "documentType": "terms_conditions", "version": "2.0", "acceptedAt": "2026-09-02T10:00:00.000-06:00", "channel": "digital", "ip": "•••••", "userAgent": "•••••"}], "meta": {"total": 1, "perPage": 20, "currentPage": 1, "lastPage": 1}}
   * @responseBody 401 - {"type": "warning", "title": "Token requerido", "detail": "No se envió un access token válido", "message": "No se envió un access token válido", "key": "AUTH.TOKEN.MISSING", "data": {"refreshable": false}}
   * @responseBody 403 - {"title": "Acceso restringido a plataforma", "detail": "Esta sección es exclusiva de administradores de plataforma.", "key": "AUTH.PLATFORM.FORBIDDEN"}
   * @responseBody 404 - {"type": "error", "title": "Empresa no encontrada", "detail": "string", "key": "empresa-no-encontrada", "code": "CONSENT.PLATFORM.010"}
   * @responseBody 422 - {"type": "error", "title": "Parámetros de historial inválidos", "detail": "string", "key": "parametros-de-historial-invalidos", "code": "CONSENT.PLATFORM.011"}
   */
  async tenantHistory(
    ctx: HttpContext,
    service: PlatformConsentService = new PlatformConsentService()
  ) {
    const { response } = ctx

    try {
      const routeParams = await this.validateHistoryParams(ctx)
      const query = await this.validateHistoryQuery(ctx)
      const result = await service.getTenantHistory(
        routeParams.businessUnitPublicId,
        query.page ?? 1,
        query.perPage ?? PLATFORM_ACCEPTANCES_DEFAULT_LIMIT
      )
      return response.status(200).header('Cache-Control', 'no-store').json(result)
    } catch (error) {
      return this.domainError(ctx, error)
    }
  }

  /**
   * Valida los params de ruta. Se validan explícitamente con `data: request.params()`
   * (la ruta no lo hace sola). Cualquier error de VineJS se traduce al error de dominio
   * `parametros-de-historial-invalidos`.
   */
  private async validateHistoryParams({ request }: HttpContext): Promise<TenantHistoryParamsPayload> {
    try {
      return await request.validateUsing(platformTenantLegalAcceptancesParamsValidator, {
        data: request.params(),
      })
    } catch (error) {
      if (this.isValidationError(error)) {
        throw new PlatformConsentError('parametros-de-historial-invalidos')
      }
      throw error
    }
  }

  /**
   * Valida la paginación del historial. Cualquier error de VineJS se traduce al error de
   * dominio `parametros-de-historial-invalidos`; lo que no sea `E_VALIDATION_ERROR` se relanza.
   */
  private async validateHistoryQuery({ request }: HttpContext): Promise<TenantHistoryQueryPayload> {
    try {
      return await request.validateUsing(platformTenantLegalAcceptancesQueryValidator)
    } catch (error) {
      if (this.isValidationError(error)) {
        throw new PlatformConsentError('parametros-de-historial-invalidos')
      }
      throw error
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

  /**
   * Traduce el error de dominio a la respuesta del contrato: `empresa-no-encontrada` responde
   * 404 y cualquier otra key 422. El cuerpo es el mismo en ambos casos (título, detalle i18n,
   * key y código por key). Lo que no sea `PlatformConsentError` se relanza al manejador global.
   */
  private domainError({ response, i18n }: HttpContext, error: unknown) {
    if (error instanceof PlatformConsentError) {
      const status = error.key === 'empresa-no-encontrada' ? 404 : 422
      return response.status(status).json({
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
