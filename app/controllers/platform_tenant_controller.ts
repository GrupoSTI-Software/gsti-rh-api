import type { HttpContext } from '@adonisjs/core/http'
import PlatformTenantService from '#services/platform_tenant_service'
import { listTenantsValidator } from '#validators/platform_tenant'
import { resolvePlatformTenantApiError } from '../helpers/platform_tenant_api_error.js'

export default class PlatformTenantController {
  private readonly service = new PlatformTenantService()

  /**
   * @index
   * @summary Listado de empresas cliente con estado de suscripción
   * @description Devuelve el listado paginado de empresas (tenants) con su estado\
   *   de suscripción resuelto por LEFT JOIN y su conteo agregado de empleados activos.\
   *   Las empresas sin suscripción aparecen con `subscription: null`.\
   *   Solo lectura; nunca expone datos nominales de empleados ni `business_unit_id` interno.
   * @tag Platform · Tenants
   * @operationId listPlatformTenants
   * @security [{"bearerAuth": []}]
   * @paramQuery search - Filtro de texto sobre nombre o razón social - string
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
   * @show
   * @summary Detalle de una empresa cliente
   * @description Devuelve el detalle de una empresa por su identificador público (UUID).\
   *   Incluye su estado de suscripción resuelto por LEFT JOIN y su conteo de empleados activos.\
   *   Si la empresa no tiene suscripción, `subscription` es `null`.\
   *   Solo lectura; nunca expone `business_unit_id` interno ni datos nominales de empleados.
   * @tag Platform · Tenants
   * @operationId getPlatformTenantDetail
   * @security [{"bearerAuth": []}]
   * @paramPath id - UUID público de la empresa (businessUnitPublicId) - string
   * @responseBody 200 - {"type": "success", "data": {}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "string", "code": "PLT.TEN.NOT_FOUND"}
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
