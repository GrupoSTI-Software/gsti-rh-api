import { HttpContext } from '@adonisjs/core/http'
import RoleService from '#services/role_service'
import { RoleFilterSearchInterface } from '../interfaces/role_filter_search_interface.js'
import BusinessUnit from '#models/business_unit'
import Role from '#models/role'
import { isReservedRoleIdentitySlug } from '#constants/system_roles'
import { isOwnRoleLockedForUser, isSystemRoleLockedForUser } from '#helpers/system_role_lock'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import { ROLES_AND_PERMISSIONS_PERMISSION_DECLARATIONS as ROLES } from '#constants/roles_and_permissions_permission_declarations'
import RolePresetService from '#services/role_preset_service'
import { RolePresetServiceError } from '#exceptions/role_preset_service_error'
import { buildRolePresetErrorResponse } from '#helpers/role_preset_error_response'
import { getRolePreset } from '#constants/role_presets'
import {
  assignRolesPermissionsBatchValidator,
  createRoleValidator,
  updateRoleValidator,
} from '#validators/role'
import db from '@adonisjs/lucid/services/db'

/**
 * Construye el CSV legado de `roleBusinessAccess` con los slugs del scope de
 * la petición (`ctx.businessUnitScope`, middleware businessScope): el rol nace
 * ligado a la empresa activa, no al pivote completo del usuario
 * (USRH1785436961936, regla 3).
 *
 * Conservamos `roleBusinessAccess` como CSV de slugs por compatibilidad con
 * código heredado que lo lee.
 */
async function buildRoleBusinessAccessFromScope(businessUnitScope: number[]): Promise<string> {
  if (businessUnitScope.length === 0) {
    return ''
  }

  const businessUnits = await BusinessUnit.query()
    .whereIn('business_unit_id', businessUnitScope)
    .whereNull('business_unit_deleted_at')
    .select('business_unit_slug')

  return businessUnits.map((unit) => unit.businessUnitSlug).join(',')
}

export default class RoleController {
  /**
   * @swagger
   * /api/roles:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Roles
   *     summary: get all
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async index({ request, response, businessUnitScope }: HttpContext) {
    try {
      const search = request.input('search')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const filters = {
        search: search,
        page: page,
        limit: limit,
      } as RoleFilterSearchInterface
      const roleService = new RoleService()
      const roles = await roleService.index(filters, businessUnitScope)
      response.status(200)
      return {
        type: 'success',
        title: 'Roles',
        message: 'The roles were found successfully',
        data: {
          roles,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/roles:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Roles
   *     summary: create new role
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               roleName:
   *                 type: string
   *                 description: Role name
   *                 required: true
   *                 default: ''
   *               roleDescription:
   *                 type: string
   *                 description: Role description
   *                 required: true
   *                 default: ''
   *               roleActive:
   *                 type: boolean
   *                 description: Role status
   *                 required: false
   *                 default: false
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async store(ctx: HttpContext) {
    const { request, response, businessUnitScope, i18n } = ctx
    const t = i18n.formatMessage.bind(i18n)
    try {
      const roleBusinessAccess = await buildRoleBusinessAccessFromScope(businessUnitScope)

      const roleService = new RoleService()
      const roleName = request.input('roleName')
      const roleDescription = request.input('roleDescription')
      const roleSlug = roleService.generateSlug(roleName)
      const roleActive = request.input('roleActive')

      // El slug sale del nombre y el runtime decide por slug: "Super
      // Administrador" le daría al rol del tenant el salvoconducto `expanded`,
      // y "Owner" o "Empleado" lo volverían visible en todas las empresas.
      // Nombre reservado, se rechaza.
      if (isReservedRoleIdentitySlug(roleSlug)) {
        response.status(400)
        return {
          title: t('system_role_name_reserved_title'),
          detail: t('system_role_name_reserved_detail'),
          key: 'rol-nombre-reservado',
        }
      }

      const role = {
        roleName: roleName,
        roleDescription: roleDescription,
        roleSlug: roleSlug,
        roleActive: roleActive,
        roleBusinessAccess: roleBusinessAccess,
      } as Role

      const data = await request.validateUsing(createRoleValidator)

      // La plantilla concede permisos al rol recién creado: con solo `create`,
      // quien no puede editar permisos repartiría las concesiones de un módulo
      // completo. El gate de la ruta ya exigió `create`; aquí se pide `update`.
      if (
        data.rolePresetSlug &&
        !(await ensureSecondaryPermission(ctx, ROLES.storeRoleWithPreset))
      ) {
        return
      }

      const valid = await roleService.verifyInfo(role)
      if (valid.status !== 200) {
        response.status(valid.status)
        return {
          type: valid.type,
          title: valid.title,
          message: valid.message,
          data: { ...data },
        }
      }

      const rolePresetSlug = data.rolePresetSlug
      let newRole: Role
      let appliedPreset: { slug: string; version: string } | undefined

      if (rolePresetSlug) {
        const preset = getRolePreset(rolePresetSlug)
        const result = await db.transaction(async (trx) => {
          const createdRole = await roleService.create(role, trx)
          const presetResult = await new RolePresetService().apply(
            createdRole.roleId,
            {
              presetSlug: rolePresetSlug,
              mode: 'replace',
              expectedPresetVersion: preset.version,
              baselinePermissionIds: [],
            },
            trx
          )
          return { role: createdRole, appliedPreset: presetResult.appliedPreset }
        })
        newRole = result.role
        appliedPreset = result.appliedPreset
      } else {
        newRole = await roleService.create(role)
      }

      if (newRole) {
        response.status(201)
        return {
          type: 'success',
          title: 'Roles',
          message: 'The role was created successfully',
          data: { role: newRole, ...(appliedPreset ? { appliedPreset } : {}) },
        }
      }
    } catch (error) {
      // La plantilla ya trae su propio contrato de error (422 permisos
      // faltantes, 404 plantilla inexistente…): degradarlo a 500 dejaría al
      // cliente sin saber que el alta falló por la plantilla y no por el rol.
      if (error instanceof RolePresetServiceError) {
        const mapped = buildRolePresetErrorResponse(error, i18n)
        response.status(mapped.status)
        return mapped.body
      }

      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/roles/{roleId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Roles
   *     summary: update role
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: roleId
   *         schema:
   *           type: number
   *         description: Role id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               roleName:
   *                 type: string
   *                 description: Role name
   *                 required: true
   *                 default: ''
   *               roleDescription:
   *                 type: string
   *                 description: Role description
   *                 required: true
   *                 default: ''
   *               roleActive:
   *                 type: boolean
   *                 description: Role status
   *                 required: false
   *                 default: false
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async update({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const roleId = request.param('roleId')
      const roleService = new RoleService()
      const roleName = request.input('roleName')
      const roleDescription = request.input('roleDescription')
      const roleSlug = roleService.generateSlug(roleName)
      const roleActive = request.input('roleActive')

      const role = {
        roleId: roleId,
        roleName: roleName,
        roleDescription: roleDescription,
        roleSlug: roleSlug,
        roleActive: roleActive,
      } as Role

      if (!roleId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The role Id was not found',
          data: { ...role },
        }
      }
      const currentRole = await Role.query()
        .whereNull('role_deleted_at')
        .where('role_id', roleId)
        .first()
      if (!currentRole) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The role was not found',
          message: 'The role was not found with the entered ID',
          data: { ...role },
        }
      }
      if (await isSystemRoleLockedForUser(auth, currentRole)) {
        response.status(403)
        return {
          title: t('system_role_locked_title'),
          detail: t('system_role_locked_detail'),
          key: 'rol-sistema-bloqueado',
        }
      }
      if (await isOwnRoleLockedForUser(auth, currentRole.roleId)) {
        response.status(403)
        return {
          title: t('own_role_locked_title'),
          detail: t('own_role_locked_detail'),
          key: 'rol-propio-bloqueado',
        }
      }
      // Renombrar un rol del tenant hacia un slug de identidad reservado le
      // daría el trato de ese rol (salvoconducto o visibilidad global). Se
      // admite conservar el slug que ya tiene: root renombrando al owner.
      if (isReservedRoleIdentitySlug(roleSlug) && currentRole.roleSlug !== roleSlug) {
        response.status(400)
        return {
          title: t('system_role_name_reserved_title'),
          detail: t('system_role_name_reserved_detail'),
          key: 'rol-nombre-reservado',
        }
      }
      const data = await request.validateUsing(updateRoleValidator)
      const verifyInfo = await roleService.verifyInfo(role)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const updateRole = await roleService.update(currentRole, role)
      if (updateRole) {
        response.status(201)
        return {
          type: 'success',
          title: 'Roles',
          message: 'The role was updated successfully',
          data: { role: updateRole },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/roles/{roleId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Roles
   *     summary: delete role
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: roleId
   *         schema:
   *           type: number
   *         description: Role id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async delete({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const roleId = request.param('roleId')
      if (!roleId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The role Id was not found',
          data: { roleId },
        }
      }
      const currentRole = await Role.query()
        .whereNull('role_deleted_at')
        .where('role_id', roleId)
        .first()
      if (!currentRole) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The role was not found',
          message: 'The role was not found with the entered ID',
          data: { roleId },
        }
      }
      if (await isSystemRoleLockedForUser(auth, currentRole)) {
        response.status(403)
        return {
          title: t('system_role_locked_title'),
          detail: t('system_role_locked_detail'),
          key: 'rol-sistema-bloqueado',
        }
      }
      if (await isOwnRoleLockedForUser(auth, currentRole.roleId)) {
        response.status(403)
        return {
          title: t('own_role_locked_title'),
          detail: t('own_role_locked_detail'),
          key: 'rol-propio-bloqueado',
        }
      }
      const roleService = new RoleService()
      const deleteRole = await roleService.delete(currentRole)
      if (deleteRole) {
        response.status(200)
        return {
          type: 'success',
          title: 'Roles',
          message: 'The role was deleted successfully',
          data: { role: deleteRole },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/roles/assign/{roleId}:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Roles
   *     summary: assign permissions to role
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: roleId
   *         schema:
   *           type: number
   *         description: Role id
   *         required: true
   *     requestBody:
   *       content:
   *          application/json:
   *           schema:
   *             type: object
   *             properties:
   *               permissions:
   *                 type: array
   *                 description: Permissions
   *                 required: true
   *                 default: []
   *               roleManagementDays:
   *                 type: number
   *                 description: Role management days
   *                 required: false
   *                 default: null
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async assign({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const roleId = request.param('roleId')
      const data = request.all()
      const role = await Role.query().whereNull('role_deleted_at').where('role_id', roleId).first()
      if (!role) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The role was not found',
          message: 'The role was not found with the entered ID',
          data: { ...request.all() },
        }
      }

      // Reasignar permisos de un rol de sistema afectaría a TODOS los tenants:
      // misma regla de bloqueo que edición/eliminación.
      if (await isSystemRoleLockedForUser(auth, role)) {
        response.status(403)
        return {
          title: t('system_role_locked_title'),
          detail: t('system_role_locked_detail'),
          key: 'rol-sistema-bloqueado',
        }
      }

      // Reasignar permisos al rol de la propia sesión sería concedérselos a sí mismo.
      if (await isOwnRoleLockedForUser(auth, role.roleId)) {
        response.status(403)
        return {
          title: t('own_role_locked_title'),
          detail: t('own_role_locked_detail'),
          key: 'rol-propio-bloqueado',
        }
      }

      const roleService = new RoleService()
      let roleSystemPermissions
      try {
        roleSystemPermissions = await db.transaction(async (trx) => {
          role.useTransaction(trx)
          role.roleManagementDays = data.roleManagementDays
          await role.save()
          return roleService.assignPermissions(roleId, data.permissions, trx)
        })
      } catch {
        response.status(500)
        return {
          title: t('role_permissions_assignment_failed_title'),
          detail: t('role_permissions_assignment_failed_detail'),
          key: 'asignacion-permisos-rol-fallida',
        }
      }

      response.status(201)
      return {
        type: 'success',
        title: 'Role Permissions',
        message: 'The role permissions were assigned successfully',
        data: { roleSystemPermissions: roleSystemPermissions },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/roles/assign-batch:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Roles
   *     summary: assign permissions to several roles atomically
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               roles:
   *                 type: array
   *                 description: Roles with their permissions to assign
   *                 required: true
   *                 items:
   *                   type: object
   *                   properties:
   *                     roleId:
   *                       type: number
   *                     permissions:
   *                       type: array
   *                       items:
   *                         type: number
   *                     roleManagementDays:
   *                       type: number
   *                       nullable: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: A role in the batch was not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '403':
   *         description: A system role in the batch is locked for the current user
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                 data:
   *                   type: object
   *       '422':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 error:
   *                   type: string
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 error:
   *                   type: string
   */
  async assignBatch({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const { roles: items } = await request.validateUsing(assignRolesPermissionsBatchValidator)

      // Preflight: se valida y se carga cada rol del lote ANTES de abrir la
      // transacción. Cualquier 404/403 detiene el lote completo sin escrituras
      // (atomicidad "todo o nada" del USRH1785766406741).
      for (const item of items) {
        const role = await Role.query()
          .whereNull('role_deleted_at')
          .where('role_id', item.roleId)
          .first()
        if (!role) {
          response.status(404)
          return {
            type: 'warning',
            title: 'The role was not found',
            message: 'The role was not found with the entered ID',
            data: { roleId: item.roleId },
          }
        }
        if (await isSystemRoleLockedForUser(auth, role)) {
          response.status(403)
          return {
            title: t('system_role_locked_batch_title'),
            detail: t('system_role_locked_batch_detail', { roleName: role.roleName }),
            key: 'rol-sistema-bloqueado-lote',
            data: {
              roleId: role.roleId,
              roleName: role.roleName,
              roleSlug: role.roleSlug,
            },
          }
        }
        // Un lote que incluya el rol de la sesión le concedería permisos al
        // propio actor: se detiene completo, igual que con un rol de sistema.
        if (await isOwnRoleLockedForUser(auth, role.roleId)) {
          response.status(403)
          return {
            title: t('own_role_locked_title'),
            detail: t('own_role_locked_batch_detail', { roleName: role.roleName }),
            key: 'rol-propio-bloqueado',
            data: {
              roleId: role.roleId,
              roleName: role.roleName,
              roleSlug: role.roleSlug,
            },
          }
        }
      }

      const roleService = new RoleService()
      try {
        await db.transaction(async (trx) => {
          await roleService.assignPermissionsBatch(items, trx)
        })
      } catch {
        response.status(500)
        return {
          title: t('role_permissions_batch_assignment_failed_title'),
          detail: t('role_permissions_batch_assignment_failed_detail'),
          key: 'asignacion-permisos-lote-fallida',
        }
      }

      response.status(201)
      return {
        type: 'success',
        title: 'Role Permissions',
        message: 'The role permissions were assigned successfully',
        data: { roleIds: items.map((item) => item.roleId) },
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(error.code === 'E_VALIDATION_ERROR' ? 422 : 500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/roles/{roleId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Roles
   *     summary: get role by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: roleId
   *         schema:
   *           type: number
   *         description: Role id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async show({ request, response }: HttpContext) {
    try {
      const roleId = request.param('roleId')
      if (!roleId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The role Id was not found',
          message: 'Missing data to process',
          data: { roleId },
        }
      }
      const roleService = new RoleService()
      const showRole = await roleService.show(roleId)
      if (!showRole) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The role was not found',
          message: 'The role was not found with the entered ID',
          data: { roleId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Roles',
          message: 'The role was found successfully',
          data: { role: showRole },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/roles/has-access/{roleId}/{systemModuleSlug}/{systemPermissionSlug}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Roles
   *     summary: get role has access by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: roleId
   *         schema:
   *           type: number
   *         description: Role id
   *         required: true
   *       - in: path
   *         name: systemModuleSlug
   *         schema:
   *           type: string
   *         description: System module slug
   *         required: true
   *       - in: path
   *         name: systemPermissionSlug
   *         schema:
   *           type: string
   *         description: System permission slug
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async hasAccess(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const roleId = request.param('roleId')
      if (!roleId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The role Id was not found',
          message: 'Missing data to process',
          data: { roleId },
        }
      }
      if (!(await this.ensureRoleAccessReadable(ctx, roleId))) {
        return
      }
      const systemModuleSlug = request.param('systemModuleSlug')
      if (!systemModuleSlug) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The system module slug was not found',
          data: { systemModuleSlug },
        }
      }
      const systemPermissionSlug = request.param('systemPermissionSlug')
      if (!systemPermissionSlug) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The system permission slug was not found',
          data: { systemPermissionSlug },
        }
      }
      const roleService = new RoleService()
      const roleHasAccess = await roleService.hasAccess(
        roleId,
        systemModuleSlug,
        systemPermissionSlug
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Roles',
        message: 'The role was found successfully',
        data: { roleHasAccess: roleHasAccess },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/roles/has-access-department/{roleId}/{departmentId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Roles
   *     summary: get role has access to department by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: roleId
   *         schema:
   *           type: number
   *         description: Role id
   *         required: true
   *       - in: path
   *         name: departmentId
   *         schema:
   *           type: number
   *         description: DepartmentId
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async hasAccessDepartment({ request, response }: HttpContext) {
    try {
      const roleId = request.param('roleId')
      if (!roleId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The role Id was not found',
          message: 'Missing data to process',
          data: { roleId },
        }
      }
      const departmentId = request.param('departmentId')
      if (!departmentId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The department Id was not found',
          message: 'Missing data to process',
          data: { departmentId },
        }
      }
      const roleService = new RoleService()
      const roleHasAccess = await roleService.hasAccessDepartment(roleId, departmentId)
      response.status(200)
      return {
        type: 'success',
        title: 'Roles',
        message: 'The role was found successfully',
        data: { roleHasAccess: roleHasAccess },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/roles/get-access-by-module/{roleId}/{systemModuleSlug}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Roles
   *     summary: get role has access by id and module
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: roleId
   *         schema:
   *           type: number
   *         description: Role id
   *         required: true
   *       - in: path
   *         name: systemModuleSlug
   *         schema:
   *           type: string
   *         description: System module slug
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getAccessByModule(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const roleId = request.param('roleId')
      if (!roleId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The role Id was not found',
          message: 'Missing data to process',
          data: { roleId },
        }
      }
      if (!(await this.ensureRoleAccessReadable(ctx, roleId))) {
        return
      }
      const systemModuleSlug = request.param('systemModuleSlug')
      if (!systemModuleSlug) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The system module slug was not found',
          data: { systemModuleSlug },
        }
      }
      const roleService = new RoleService()
      const roleGetAccess = await roleService.getAccessByModule(roleId, systemModuleSlug)
      response.status(roleGetAccess.status)
      return {
        type: roleGetAccess.type,
        title: roleGetAccess.title,
        message: roleGetAccess.message,
        data: { permissions: roleGetAccess.data },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/roles/get-access/{roleId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Roles
   *     summary: get role has access by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: roleId
   *         schema:
   *           type: number
   *         description: Role id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getAccess(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const roleId = request.param('roleId')
      if (!roleId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The role Id was not found',
          message: 'Missing data to process',
          data: { roleId },
        }
      }
      if (!(await this.ensureRoleAccessReadable(ctx, roleId))) {
        return
      }
      const roleService = new RoleService()
      const roleGetAccess = await roleService.getAccess(roleId)
      response.status(roleGetAccess.status)
      return {
        type: roleGetAccess.type,
        title: roleGetAccess.title,
        message: roleGetAccess.message,
        data: { permissions: roleGetAccess.data },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * `has-access`, `get-access` y `get-access-by-module` quedan sin gate porque
   * son la plomería de sesión del menú y del guard de cada pantalla, y el
   * backoffice siempre pregunta por el rol de la sesión. Otro `roleId` expone la
   * matriz de un rol ajeno: solo se admite con `roles-and-permissions:read`
   * (root y owner por salvoconducto).
   *
   * @returns `false` cuando ya respondió 403 con la negativa uniforme del gate.
   */
  private async ensureRoleAccessReadable(
    ctx: HttpContext,
    roleId: string | number
  ): Promise<boolean> {
    if (ctx.auth.user?.roleId === Number(roleId)) {
      return true
    }
    return ensureSecondaryPermission(ctx, ROLES.readOtherRoleAccess)
  }
}
