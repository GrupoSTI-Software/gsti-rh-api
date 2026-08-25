import type { HttpContext } from '@adonisjs/core/http'
import PlatformTenantService from '#services/platform_tenant_service'
import { listTenantsValidator } from '#validators/platform_tenant'
import { resolvePlatformTenantApiError } from '../helpers/platform_tenant_api_error.js'

/**
 * Empresas cliente en la consola de plataforma GSTI (USRH1786737531069).
 *
 * Solo lectura. El detalle incluye el perfil fiscal capturado por el tenant
 * para consulta del operador que emite facturas.
 */
export default class PlatformTenantController {
  private readonly service = new PlatformTenantService()

  /**
   * @swagger
   * /api/platform/tenants:
   *   get:
   *     tags:
   *       - Platform · Tenants
   *     summary: Listado de empresas cliente con estado de suscripción
   *     description: |
   *       Devuelve el listado paginado de empresas (tenants) con su estado de suscripción
   *       resuelto por LEFT JOIN y su conteo agregado de empleados activos.
   *       Las empresas sin suscripción aparecen con subscription null.
   *       El parámetro search también acepta un RFC completo válido ante el SAT;
   *       en ese caso resuelve por huella ciega sin buscar fragmentos de RFC.
   *       Solo lectura; nunca expone datos nominales de empleados ni business_unit_id interno.
   *       Requiere sesión válida y is_platform_admin = 1.
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
   *           enum: [trialing, active, past_due, canceled]
   *         description: Filtro por estado de suscripción
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
   *         description: Listado paginado de empresas cliente
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
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
   *                       businessUnitLegalName:
   *                         type: string
   *                       businessUnitActive:
   *                         type: integer
   *                       activeEmployees:
   *                         type: integer
   *                       subscription:
   *                         type: object
   *                         nullable: true
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
   *                   example: Tenants de plataforma
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: datos-invalidos
   *                 code:
   *                   type: string
   *                   example: PLT.TEN.VAL_INPUT
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
   *
   * @index
   * @summary Listado de empresas cliente con estado de suscripción
   * @description Devuelve el listado paginado de empresas (tenants) con su estado\
   *   de suscripción resuelto por LEFT JOIN y su conteo agregado de empleados activos.\
   *   Las empresas sin suscripción aparecen con subscription null.\
   *   El parámetro search también acepta un RFC completo válido ante el SAT;\
   *   en ese caso resuelve por huella ciega sin buscar fragmentos de RFC.\
   *   Solo lectura; nunca expone datos nominales de empleados ni business_unit_id interno.
   * @tag Platform · Tenants
   * @operationId listPlatformTenants
   * @security [{"bearerAuth": []}]
   * @paramQuery search - Filtro sobre nombre comercial, nombre legal registrado o RFC completo válido SAT - string
   * @paramQuery status - Filtro por estado de suscripción (trialing|active|past_due|canceled) - string
   * @paramQuery page - Página (default 1) - integer
   * @paramQuery limit - Resultados por página, máx 100 (default 20) - integer
   * @responseBody 200 - {"type": "success", "data": [], "meta": {"total": 0, "page": 1, "limit": 20, "lastPage": 1}}
   * @responseBody 422 - {"title": "string", "detail": "string", "key": "string", "code": "PLT.TEN.VAL_INPUT"}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   */
  async index({ request, response }: HttpContext) {
    try {
      const { search, status, page, limit } = await request.validateUsing(listTenantsValidator)
      const result = await this.service.listTenants({
        search,
        status,
        page: page ?? 1,
        limit: limit ?? 20,
      })
      return response.status(200).json({ type: 'success', ...result })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformTenantApiError(error)
      return response.status(httpStatus).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/tenants/{id}:
   *   get:
   *     tags:
   *       - Platform · Tenants
   *     summary: Detalle de una empresa cliente con perfil fiscal
   *     description: |
   *       Devuelve el detalle de una empresa por su identificador público (UUID).
   *       Incluye suscripción, conteo de empleados activos y billingProfile con los datos
   *       fiscales capturados por el cliente (RFC descifrado, régimen y uso con etiqueta SAT).
   *       Si la empresa nunca capturó datos fiscales, billingProfile es null.
   *       Solo lectura; el operador de plataforma no edita el perfil fiscal desde aquí.
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: UUID público de la empresa (businessUnitPublicId)
   *     responses:
   *       '200':
   *         description: Detalle de la empresa con perfil fiscal opcional
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
   *                     businessUnitPublicId:
   *                       type: string
   *                       format: uuid
   *                     businessUnitName:
   *                       type: string
   *                     businessUnitLegalName:
   *                       type: string
   *                     businessUnitActive:
   *                       type: integer
   *                     activeEmployees:
   *                       type: integer
   *                     subscription:
   *                       type: object
   *                       nullable: true
   *                     billingProfile:
   *                       type: object
   *                       nullable: true
   *                       description: Perfil fiscal capturado por el cliente; null si nunca capturó
   *                       properties:
   *                         rfc:
   *                           type: string
   *                           nullable: true
   *                           example: ABC010101AB9
   *                         legalName:
   *                           type: string
   *                           nullable: true
   *                           description: Razón social fiscal (distinta del nombre legal registrado)
   *                         postalCode:
   *                           type: string
   *                           nullable: true
   *                           example: "06600"
   *                         taxRegimeCode:
   *                           type: string
   *                           nullable: true
   *                           example: "601"
   *                         taxRegimeLabel:
   *                           type: string
   *                           nullable: true
   *                           example: General de Ley Personas Morales
   *                         cfdiUseCode:
   *                           type: string
   *                           nullable: true
   *                           example: G03
   *                         cfdiUseLabel:
   *                           type: string
   *                           nullable: true
   *                           example: Gastos en general
   *                         billingEmail:
   *                           type: string
   *                           nullable: true
   *                           example: facturas@empresa.mx
   *                         billingProfileComplete:
   *                           type: boolean
   *                         missingFields:
   *                           type: array
   *                           items:
   *                             type: string
   *                             enum: [rfc, legalName, postalCode, taxRegimeCode, cfdiUseCode]
   *                         capturedAt:
   *                           type: string
   *                           format: date-time
   *                           nullable: true
   *                         updatedAt:
   *                           type: string
   *                           format: date-time
   *                           nullable: true
   *       '404':
   *         description: Empresa no encontrada
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Tenants de plataforma
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: tenant-no-encontrado
   *                 code:
   *                   type: string
   *                   example: PLT.TEN.NOT_FOUND
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
   *
   * @show
   * @summary Detalle de una empresa cliente con perfil fiscal
   * @description Devuelve el detalle de una empresa por su identificador público (UUID).\
   *   Incluye suscripción, conteo de empleados activos y billingProfile con los datos\
   *   fiscales capturados por el cliente (RFC descifrado, régimen y uso con etiqueta SAT).\
   *   Si la empresa nunca capturó datos fiscales, billingProfile es null.\
   *   Solo lectura; el operador de plataforma no edita el perfil fiscal desde aquí.
   * @tag Platform · Tenants
   * @operationId getPlatformTenantDetail
   * @security [{"bearerAuth": []}]
   * @paramPath id - UUID público de la empresa (businessUnitPublicId) - string
   * @responseBody 200 - {"type": "success", "data": {"businessUnitPublicId": "uuid", "businessUnitName": "Empresa Demo", "businessUnitLegalName": "Empresa Demo SA de CV", "businessUnitActive": 1, "activeEmployees": 12, "subscription": null, "billingProfile": {"rfc": "ABC010101AB9", "legalName": "Abc SA de CV", "postalCode": "06600", "taxRegimeCode": "601", "taxRegimeLabel": "General de Ley Personas Morales", "cfdiUseCode": "G03", "cfdiUseLabel": "Gastos en general", "billingEmail": "facturas@empresa.mx", "billingProfileComplete": true, "missingFields": [], "capturedAt": "2026-08-01T12:00:00.000Z", "updatedAt": "2026-08-01T12:00:00.000Z"}}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "tenant-no-encontrado", "code": "PLT.TEN.NOT_FOUND"}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   */
  async show({ params, response }: HttpContext) {
    try {
      const tenant = await this.service.getTenantDetail(params.id)
      return response.status(200).json({ type: 'success', data: tenant })
    } catch (error) {
      const { status: httpStatus, ...body } = resolvePlatformTenantApiError(error)
      return response.status(httpStatus).json(body)
    }
  }
}
