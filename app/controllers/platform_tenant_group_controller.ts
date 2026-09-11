import type { HttpContext } from '@adonisjs/core/http'
import PlatformTenantGroupService from '#services/platform_tenant_group_service'
import {
  createTenantGroupValidator,
  listTenantGroupsValidator,
  updateTenantGroupValidator,
} from '#validators/platform_tenant_group'
import { resolveTenantGroupApiError } from '../helpers/platform_tenant_group_api_error.js'

/**
 * Grupos económicos de tenants en la consola de plataforma GSTI (USRH1788052455657).
 * Alta, listado, cambio de nombre/vigencia y baja lógica con liberación de cuentas.
 */
export default class PlatformTenantGroupController {
  private readonly service = new PlatformTenantGroupService()

  /**
   * @swagger
   * /api/platform/tenant-groups:
   *   get:
   *     tags:
   *       - Platform · TenantGroups
   *     summary: Listado de grupos de tenants con sus cuentas
   *     description: |
   *       Devuelve los grupos vivos ordenados por nombre ascendente, cada uno con
   *       su vigencia, su conteo de cuentas y sus integrantes.
   *       Los inactivos se excluyen salvo incluirInactivos=true. Los dados de baja nunca aparecen.
   *       Las cuentas con baja lógica no se listan ni se cuentan, aunque su pertenencia siga registrada.
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
   *           maxLength: 150
   *         description: Filtro sobre el nombre del grupo
   *       - in: query
   *         name: incluirInactivos
   *         required: false
   *         schema:
   *           type: boolean
   *           default: false
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
   *         description: Listado paginado de grupos
   *       '422':
   *         description: Parámetros de consulta inválidos
   *       '403':
   *         description: Sin permisos de administrador de plataforma
   *
   * @index
   * @summary Listado de grupos de tenants con sus cuentas
   * @description Devuelve los grupos vivos ordenados por nombre ascendente, cada uno con su vigencia, conteo e integrantes. Requiere sesión válida y marca de administrador de plataforma.
   * @tag Platform · TenantGroups
   * @operationId listPlatformTenantGroups
   * @security [{"bearerAuth": []}]
   * @paramQuery search - Filtro sobre el nombre del grupo - string
   * @paramQuery incluirInactivos - Incluir grupos inactivos (default false) - boolean
   * @paramQuery page - Página (default 1) - integer
   * @paramQuery limit - Resultados por página, máx 100 (default 20) - integer
   * @responseBody 200 - {"type": "success", "data": [{"platformTenantGroupId": 1, "nombre": "Grupo Manny", "activo": true, "tenantsCount": 0, "tenants": []}], "meta": {"total": 1, "page": 1, "limit": 20, "lastPage": 1}}
   * @responseBody 422 - {"title": "string", "detail": "string", "key": "datos-invalidos", "code": "PLT.GRP.VAL_INPUT"}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   */
  async index({ request, response }: HttpContext) {
    try {
      const { search, incluirInactivos, page, limit } =
        await request.validateUsing(listTenantGroupsValidator)
      const result = await this.service.listGroups({
        search,
        incluirInactivos: incluirInactivos ?? false,
        page: page ?? 1,
        limit: limit ?? 20,
      })
      return response.status(200).json({ type: 'success', ...result })
    } catch (error) {
      const { status: httpStatus, ...body } = resolveTenantGroupApiError(error)
      return response.status(httpStatus).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/tenant-groups:
   *   post:
   *     tags:
   *       - Platform · TenantGroups
   *     summary: Dar de alta un grupo de tenants
   *     description: |
   *       Crea un grupo activo con cero cuentas. El nombre no se repite entre grupos vivos:
   *       la comparación ignora espacios sobrantes y mayúsculas. Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [nombre]
   *             properties:
   *               nombre:
   *                 type: string
   *                 minLength: 2
   *                 maxLength: 150
   *                 example: Grupo Manny
   *     responses:
   *       '201':
   *         description: Grupo creado
   *       '422':
   *         description: Nombre ya registrado o datos inválidos
   *
   * @store
   * @summary Dar de alta un grupo de tenants
   * @description Crea un grupo activo con cero cuentas. El nombre no se repite entre grupos vivos. Requiere sesión válida y marca de administrador de plataforma.
   * @tag Platform · TenantGroups
   * @operationId createPlatformTenantGroup
   * @security [{"bearerAuth": []}]
   * @requestBody {"nombre": "Grupo Manny"}
   * @responseBody 201 - {"type": "success", "data": {"platformTenantGroupId": 1, "nombre": "Grupo Manny", "activo": true, "tenantsCount": 0, "tenants": []}}
   * @responseBody 422 - {"title": "No fue posible crear el grupo de tenants", "detail": "Ya existe un grupo de tenants registrado con ese nombre.", "key": "nombre-de-grupo-ya-registrado", "code": "PLT.GRP.NAME_TAKEN"}
   */
  async store({ request, response }: HttpContext) {
    try {
      const { nombre } = await request.validateUsing(createTenantGroupValidator)
      const grupo = await this.service.createGroup(nombre)
      return response.status(201).json({ type: 'success', data: grupo })
    } catch (error) {
      const { status: httpStatus, ...body } = resolveTenantGroupApiError(error)
      return response.status(httpStatus).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/tenant-groups/{platformTenantGroupId}:
   *   put:
   *     tags:
   *       - Platform · TenantGroups
   *     summary: Renombrar y/o cambiar la vigencia de un grupo
   *     description: |
   *       Acepta nombre y/o activo; al menos uno es obligatorio.
   *       Desactivar no es dar de baja: el grupo sigue viéndose con sus cuentas.
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: platformTenantGroupId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               nombre:
   *                 type: string
   *                 minLength: 2
   *                 maxLength: 150
   *               activo:
   *                 type: boolean
   *     responses:
   *       '200':
   *         description: Grupo actualizado
   *       '404':
   *         description: Grupo no encontrado o dado de baja
   *       '422':
   *         description: Datos inválidos o nombre ya registrado
   *
   * @update
   * @summary Renombrar y/o cambiar la vigencia de un grupo
   * @description Acepta nombre y/o activo; al menos uno es obligatorio. Desactivar conserva el grupo y sus cuentas. Requiere sesión válida y marca de administrador de plataforma.
   * @tag Platform · TenantGroups
   * @operationId updatePlatformTenantGroup
   * @security [{"bearerAuth": []}]
   * @paramPath platformTenantGroupId - Identificador del grupo - integer
   * @requestBody {"nombre": "Grupo Manny Corporativo", "activo": false}
   * @responseBody 200 - {"type": "success", "data": {"platformTenantGroupId": 1, "nombre": "Grupo Manny Corporativo", "activo": false, "tenantsCount": 0, "tenants": []}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "grupo-no-encontrado", "code": "PLT.GRP.NOT_FOUND"}
   * @responseBody 422 - {"title": "string", "detail": "string", "key": "datos-invalidos", "code": "PLT.GRP.VAL_INPUT"}
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const { nombre, activo } = await request.validateUsing(updateTenantGroupValidator)
      const grupo = await this.service.updateGroup(Number(params.platformTenantGroupId), {
        nombre,
        activo,
      })
      return response.status(200).json({ type: 'success', data: grupo })
    } catch (error) {
      const { status: httpStatus, ...body } = resolveTenantGroupApiError(error)
      return response.status(httpStatus).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/tenant-groups/{platformTenantGroupId}:
   *   delete:
   *     tags:
   *       - Platform · TenantGroups
   *     summary: Dar de baja lógica un grupo y liberar sus cuentas
   *     description: |
   *       Baja lógica: el grupo deja de existir para el panel y sus cuentas quedan sueltas
   *       conservando toda su información. Ambas cosas ocurren juntas o no ocurre ninguna.
   *       El nombre liberado se puede volver a usar. Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: platformTenantGroupId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Grupo dado de baja
   *       '404':
   *         description: Grupo no encontrado o ya dado de baja
   *
   * @destroy
   * @summary Dar de baja lógica un grupo y liberar sus cuentas
   * @description Baja lógica con liberación de cuentas en una sola transacción. El nombre liberado se puede volver a usar. Requiere sesión válida y marca de administrador de plataforma.
   * @tag Platform · TenantGroups
   * @operationId deletePlatformTenantGroup
   * @security [{"bearerAuth": []}]
   * @paramPath platformTenantGroupId - Identificador del grupo - integer
   * @responseBody 200 - {"type": "success", "data": {"platformTenantGroupId": 1, "tenantsLiberados": 0}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "grupo-no-encontrado", "code": "PLT.GRP.NOT_FOUND"}
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const resultado = await this.service.deleteGroup(Number(params.platformTenantGroupId))
      return response.status(200).json({ type: 'success', data: resultado })
    } catch (error) {
      const { status: httpStatus, ...body } = resolveTenantGroupApiError(error)
      return response.status(httpStatus).json(body)
    }
  }
}
