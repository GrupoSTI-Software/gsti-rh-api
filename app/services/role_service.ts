import Department from '#models/department'
import { PLATFORM_ROLE_SLUG } from '#constants/system_roles'
import {
  applyRoleBusinessScope,
  buildRoleBusinessScope,
  isRoleInBusinessScope,
} from '#helpers/role_business_scope'
import Role from '#models/role'
import RoleDepartment from '#models/role_department'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { RoleFilterSearchInterface } from '../interfaces/role_filter_search_interface.js'

/** Qué parte de cada rol entrega el listado. */
export interface RoleIndexOptions {
  /**
   * Precarga `roleSystemPermissions`. Solo con `roles-and-permissions:read`
   * (o bypass): la matriz de un rol ajeno no se entrega a quien solo llena un
   * select de Usuarios.
   */
  includeGrants: boolean
}

export default class RoleService {
  async index(
    filters: RoleFilterSearchInterface,
    allowedBusinessUnitIds: number[] = [],
    options: RoleIndexOptions = { includeGrants: false }
  ) {
    const scope = await buildRoleBusinessScope(allowedBusinessUnitIds)

    // El listado trae los roles de la empresa activa, los de sistema (visibles
    // en todo tenant) y —mientras no corra el backfill— los heredados que aún
    // se distinguen por el CSV. La regla completa vive en
    // `helpers/role_business_scope.ts`, que también usa el listado de usuarios.
    const query = Role.query().whereNull('role_deleted_at')
    applyRoleBusinessScope(query, scope)

    const roles = await query
      .if(filters.search, (searchScoped) => {
        searchScoped.andWhere((searchQuery) => {
          searchQuery.whereRaw('UPPER(role_name) LIKE ?', [`%${filters.search.toUpperCase()}%`])
        })
      })
      .preload('roleDepartments')
      .if(options.includeGrants, (grantsScoped) => {
        grantsScoped.preload('roleSystemPermissions')
      })
      .orderBy('role_id')
      .paginate(filters.page, filters.limit)
    return roles
  }

  async create(role: Role, trx?: TransactionClientContract) {
    const newRole = new Role()
    newRole.roleName = role.roleName
    newRole.roleDescription = role.roleDescription
    newRole.roleSlug = role.roleSlug
    newRole.businessUnitId = role.businessUnitId ?? null
    newRole.roleActive = role.roleActive
    if (trx) newRole.useTransaction(trx)
    await newRole.save()
    return newRole
  }

  /**
   * El slug NO se reescribe al renombrar: es la identidad del rol, lo que
   * decide el runtime (`RESERVED_ROLE_IDENTITY_SLUGS`) y lo que sostiene el
   * candado único por empresa. Un rename que lo moviera cambiaría en silencio
   * el rol al que apuntan las referencias por slug y podría chocar contra el
   * índice. Ni la empresa dueña se toca: un rol no cambia de dueño.
   */
  async update(currentRole: Role, role: Role) {
    currentRole.roleName = role.roleName
    currentRole.roleDescription = role.roleDescription
    currentRole.roleActive = role.roleActive
    await currentRole.save()
    return currentRole
  }

  async delete(currentRole: Role) {
    await currentRole.delete()
    return currentRole
  }

  async assignPermissions(
    roleId: number,
    permissions: Array<number>,
    trx?: TransactionClientContract
  ) {
    const queryPermissions = () => {
      const query = RoleSystemPermission.query()
        .whereNull('role_system_permission_deleted_at')
        .where('role_id', roleId)
      return trx ? query.useTransaction(trx) : query
    }

    let rolePermissions = await queryPermissions()
    if (rolePermissions) {
      if (permissions === undefined) {
        permissions = []
      }
      for await (const item of rolePermissions) {
        const existPermission = permissions.find(
          (a: number) => Number.parseInt(a.toString()) === item.systemPermissionId
        )
        if (!existPermission) {
          if (trx) item.useTransaction(trx)
          await item.delete()
        }
      }
    }
    for await (const permissionId of permissions) {
      const existRoleSystemPermission = rolePermissions.find(
        (a) => a.systemPermissionId === Number.parseInt(permissionId.toString())
      )
      if (!existRoleSystemPermission) {
        const newPermission = new RoleSystemPermission()
        newPermission.roleId = roleId
        newPermission.systemPermissionId = permissionId
        if (trx) newPermission.useTransaction(trx)
        await newPermission.save()
      }
    }
    rolePermissions = await queryPermissions()
    return rolePermissions
  }

  /**
   * Aplica `roleManagementDays` y sincroniza permisos para cada rol del lote,
   * bajo la `trx` provista por el caller. No abre ni confirma la transacción:
   * si alguna operación falla, el error debe burbujear para que el caller
   * haga rollback de TODO el lote (atomicidad).
   */
  async assignPermissionsBatch(
    items: Array<{
      roleId: number
      permissions: number[]
      roleManagementDays: number | null
    }>,
    trx: TransactionClientContract
  ): Promise<void> {
    for (const item of items) {
      const role = await Role.query()
        .useTransaction(trx)
        .whereNull('role_deleted_at')
        .where('role_id', item.roleId)
        .firstOrFail()

      role.useTransaction(trx)
      role.roleManagementDays = item.roleManagementDays
      await role.save()
      await this.assignPermissions(item.roleId, item.permissions, trx)
    }
  }

  /**
   * Detalle de un rol acotado a la empresa activa: un rol de otra empresa
   * responde `null` para que el caller conteste 404 sin revelar que existe,
   * igual que el resto del repo.
   */
  async show(roleId: number, allowedBusinessUnitIds: number[] = []) {
    const scope = await buildRoleBusinessScope(allowedBusinessUnitIds)
    const query = Role.query()
      .whereNull('role_deleted_at')
      .where('role_id', roleId)
      .preload('roleSystemPermissions')
    applyRoleBusinessScope(query, scope)

    const role = await query.first()
    return role ? role : null
  }

  /**
   * `owner` (USRH1783712837561) hace bypass de permiso igual que `root`, pero NO es
   * equivalente a `root`: este método solo resuelve QUÉ ACCIONES puede ejecutar un rol,
   * nunca QUÉ EMPRESA puede ver. El scope multitenant (`BusinessAccessScopeService` /
   * `business_unit_scope_middleware`) sigue acotando a `owner` a su propia empresa
   * exactamente como a cualquier rol no-root; ese scope no se toca aquí.
   */
  async hasAccess(roleId: number, systemModuleSlug: string, action: string) {
    const role = await Role.query().whereNull('role_deleted_at').where('role_id', roleId).first()
    if (!role) {
      return false
    }
    if (role.roleSlug === 'root' || role.roleSlug === 'owner') {
      return true
    }
    const systemModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', systemModuleSlug)
      .where('system_module_active', 1)
      .first()

    if (!systemModule) {
      return false
    }

    const systemPermission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', systemModule.systemModuleId)
      .where('system_permission_slug', action)
      .first()
    if (!systemPermission) {
      return false
    }

    const roleSystemPermissions = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleId)
      .where('system_permission_id', systemPermission.systemPermissionId)
      .first()
    if (!roleSystemPermissions) {
      return false
    }
    return true
  }

  /**
   * Igual que `hasAccess`, pero SIN el atajo `role.roleSlug === 'root'`: consulta
   * siempre la fila real en `role_system_permissions`, sin importar el rol.
   *
   * Uso: gates de negocio que deben ser revocables incluso para `root` (p.ej. el
   * revelado de metadatos sensibles de USRH1783368377327), donde otorgar el
   * permiso "por identidad de rol" rompería la propiedad de ser un permiso real
   * y auditable. `hasAccess` sigue siendo el método correcto para reservas de
   * módulo estándar (root siempre administra todo).
   */
  async hasExplicitAccess(roleId: number, systemModuleSlug: string, action: string) {
    const role = await Role.query().whereNull('role_deleted_at').where('role_id', roleId).first()
    if (!role) {
      return false
    }
    const systemModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', systemModuleSlug)
      .where('system_module_active', 1)
      .first()

    if (!systemModule) {
      return false
    }

    const systemPermission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', systemModule.systemModuleId)
      .where('system_permission_slug', action)
      .first()
    if (!systemPermission) {
      return false
    }

    const roleSystemPermission = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleId)
      .where('system_permission_id', systemPermission.systemPermissionId)
      .first()
    return !!roleSystemPermission
  }

  async hasAccessDepartment(roleId: number, departmentId: number) {
    const role = await Role.query().whereNull('role_deleted_at').where('role_id', roleId).first()
    if (!role) {
      return false
    }
    const department = await Department.query()
      .whereNull('department_deleted_at')
      .where('department_id', departmentId)
      .first()

    if (!department) {
      return false
    }

    const roleDepartment = await RoleDepartment.query()
      .whereNull('role_department_deleted_at')
      .where('role_id', roleId)
      .where('department_id', department.departmentId)
      .first()
    if (!roleDepartment) {
      return false
    }
    return true
  }

  async getAccess(roleId: number) {
    const role = await Role.query().whereNull('role_deleted_at').where('role_id', roleId).first()
    if (!role) {
      return {
        status: 404,
        type: 'warning',
        title: 'The role was not found',
        message: 'The role was not found with the entered ID',
        data: { roleId },
      }
    }

    const systemPermissions = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .orderBy('system_permission_id')
    const permissionsIds = []
    for await (const systemPermission of systemPermissions) {
      permissionsIds.push(systemPermission.systemPermissionId)
    }

    const roleSystemPermissions = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleId)
      .whereIn('system_permission_id', permissionsIds)
      .preload('systemPermissions')
      .orderBy('role_system_permission_id')
    return {
      status: 200,
      type: 'success',
      title: 'Role system permissions',
      message: 'The system permissions were found successfully',
      data: roleSystemPermissions,
    }
  }

  async getAccessByModule(roleId: number, systemModuleSlug: string) {
    const role = await Role.query().whereNull('role_deleted_at').where('role_id', roleId).first()
    if (!role) {
      return {
        status: 404,
        type: 'warning',
        title: 'The role was not found',
        message: 'The role was not found with the entered ID',
        data: { roleId },
      }
    }
    const systemModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', systemModuleSlug)
      .where('system_module_active', 1)
      .first()

    if (!systemModule) {
      return {
        status: 404,
        type: 'warning',
        title: 'The system module was not found',
        message: 'The system module was not found with the entered slug',
        data: { systemModuleSlug },
      }
    }

    const systemPermissions = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_module_id', systemModule.systemModuleId)
      .orderBy('system_permission_id')
    const permissionsIds = []
    for await (const systemPermission of systemPermissions) {
      permissionsIds.push(systemPermission.systemPermissionId)
    }

    const roleSystemPermissions = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleId)
      .whereIn('system_permission_id', permissionsIds)
      .preload('systemPermissions')
      .orderBy('role_system_permission_id')
    return {
      status: 200,
      type: 'success',
      title: 'Role system permissions',
      message: 'The system permissions were found successfully',
      data: roleSystemPermissions,
    }
  }

  async hasAccessToFullEmployees(roleId: number) {
    // `owner` ve toda la plantilla de su empresa, igual que pasa el gate de
    // `hasAccess`; el scope por empresa lo sigue poniendo el middleware.
    const role = await Role.query().whereNull('role_deleted_at').where('role_id', roleId).first()
    if (role?.roleSlug === 'owner') {
      return true
    }
    const systemPermissionFullEmployee = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_permission_slug', 'full-employee-assigned')
      .first()
    if (systemPermissionFullEmployee) {
      const roleSystemPermission = await RoleSystemPermission.query()
        .whereNull('role_system_permission_deleted_at')
        .where('system_permission_id', systemPermissionFullEmployee.systemPermissionId)
        .where('role_id', roleId)
        .first()
      if (roleSystemPermission) {
        return true
      }
    }
    return false
  }

  async verifyInfo(role: Role) {
    const action = role.roleId > 0 ? 'updated' : 'created'

    const query = Role.query().where('role_name', role.roleName).whereNull('role_deleted_at')

    if (role.roleId > 0) {
      query.whereNot('role_id', role.roleId)
    }

    const rolesWithSameName = await query

    // Dos roles pueden llamarse igual en empresas distintas; dentro de la misma,
    // no. La empresa dueña es la llave: antes esto se decidía cruzando dos CSV
    // de slugs, que era la forma de preguntar lo mismo cuando el rol no tenía
    // dueño.
    const hasConflict = rolesWithSameName.some(
      (existingRole) =>
        role.businessUnitId !== null &&
        role.businessUnitId !== undefined &&
        existingRole.businessUnitId === role.businessUnitId
    )

    if (hasConflict && role.roleName) {
      return {
        status: 400,
        type: 'warning',
        title: 'The role exists for another role',
        message: `The role resource cannot be ${action} because the role name is already assigned to another role in the same company`,
        data: { ...role },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Info verified successfully',
      message: 'Info verified successfully',
      data: { ...role },
    }
  }

  generateSlug(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  /**
   * Busca un rol por su slug, con la empresa por delante.
   *
   * El orden importa:
   *
   *  1. Rol PROPIO de alguna de las empresas del alcance
   *     (`business_unit_id`). Es el criterio definitivo desde que cada empresa
   *     estrena su juego de roles al nacer
   *     (`TenantRoleProvisioningService`), y por eso va primero: con un `owner`
   *     por cliente, resolver el slug a secas devolvería el del cliente más
   *     antiguo.
   *  2. Rol global de plataforma, `business_unit_id IS NULL`: solo `root`.
   *
   * @param roleSlug - Slug del rol a buscar
   * @param allowedBusinessUnitIds - Empresas del alcance; vacío = sin empresa conocida
   * @returns Rol encontrado o null
   */
  async findRoleBySlug(
    roleSlug: string,
    allowedBusinessUnitIds: number[] = []
  ): Promise<Role | null> {
    if (allowedBusinessUnitIds.length > 0) {
      const ownedRole = await Role.query()
        .where('role_slug', roleSlug)
        .whereNull('role_deleted_at')
        .whereIn('business_unit_id', allowedBusinessUnitIds)
        .orderBy('role_id', 'asc')
        .first()

      if (ownedRole) {
        return ownedRole
      }
    }

    // Roles globales de la plataforma. `orderBy` fija la fila sembrada (la más
    // antigua) ante cualquier residuo histórico con slug duplicado.
    if (roleSlug === PLATFORM_ROLE_SLUG) {
      const globalRole = await Role.query()
        .where('role_slug', roleSlug)
        .whereNull('role_deleted_at')
        .whereNull('business_unit_id')
        .orderBy('role_id', 'asc')
        .first()

      if (globalRole) {
        return globalRole
      }
    }

    return null
  }

  /**
   * Busca un rol por id acotado a la empresa activa, con el mismo criterio que
   * `index` (`helpers/role_business_scope.ts`): la empresa dueña
   * (`business_unit_id`), los roles de sistema globales y —temporalmente— los
   * heredados que solo tienen el CSV. Devuelve `null` cuando el rol existe pero
   * es de otra empresa, para que el caller responda 404 sin revelar que existe.
   *
   * Un alcance vacío no resuelve nada: sin empresa activa no hay rol que tocar
   * (fail-closed). Antes, un alcance vacío miraba TODAS las empresas activas.
   */
  async findRoleByIdInScope(
    roleId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<Role | null> {
    const role = await Role.query().whereNull('role_deleted_at').where('role_id', roleId).first()

    if (!role) {
      return null
    }

    const scope = await buildRoleBusinessScope(allowedBusinessUnitIds)
    return isRoleInBusinessScope(role, scope) ? role : null
  }

  /**
   * ¿La empresa activa ya tiene un rol vivo con ese slug? Es el pre-check del
   * alta: el slug se deriva del nombre y el candado único es por empresa, así
   * que un duplicado tiene que responder 409 y no reventar contra el índice
   * con un 500.
   *
   * Mira el mismo alcance que el listado a propósito: un rol heredado que la
   * empresa ve por CSV también ocupa el nombre, aunque el índice no lo impida
   * mientras su `business_unit_id` siga en NULL.
   */
  async findLiveRoleWithSlugInScope(
    roleSlug: string,
    allowedBusinessUnitIds: number[] = []
  ): Promise<Role | null> {
    const scope = await buildRoleBusinessScope(allowedBusinessUnitIds)
    const query = Role.query().whereNull('role_deleted_at').where('role_slug', roleSlug)
    applyRoleBusinessScope(query, scope)

    return (await query.first()) ?? null
  }
}
