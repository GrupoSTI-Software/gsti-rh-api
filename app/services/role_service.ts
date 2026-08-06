import BusinessUnit from '#models/business_unit'
import Department from '#models/department'
import { SYSTEM_ROLE_SLUGS, isSystemRoleSlug } from '#constants/system_roles'
import Role from '#models/role'
import RoleDepartment from '#models/role_department'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { RoleFilterSearchInterface } from '../interfaces/role_filter_search_interface.js'

export default class RoleService {
  async index(filters: RoleFilterSearchInterface, allowedBusinessUnitIds: number[] = []) {
    let slugs: string[] = []
    if (allowedBusinessUnitIds.length > 0) {
      const units = await BusinessUnit.query()
        .whereIn('business_unit_id', allowedBusinessUnitIds)
        .select('business_unit_slug')
      slugs = units.map((bu) => bu.businessUnitSlug)
    }

    // Roles de sistema (owner, empleado) siempre visibles en todo tenant
    // (USRH1785436961936); el resto se filtra por role_business_access.
    const roles = await Role.query()
      .whereNull('role_deleted_at')
      .andWhere((query) => {
        query.whereIn('role_slug', [...SYSTEM_ROLE_SLUGS])
        if (slugs.length === 0) {
          return
        }
        query.orWhere((accessQuery) => {
          accessQuery.whereNotNull('role_business_access')
          accessQuery.andWhere((subQuery) => {
            slugs.forEach((slug) => {
              subQuery.orWhereRaw('FIND_IN_SET(?, role_business_access)', [slug.trim()])
            })
          })
        })
      })
      .if(filters.search, (query) => {
        query.andWhere((searchQuery) => {
          searchQuery.whereRaw('UPPER(role_name) LIKE ?', [`%${filters.search.toUpperCase()}%`])
        })
      })
      .preload('roleDepartments')
      .preload('roleSystemPermissions')
      .orderBy('role_id')
      .paginate(filters.page, filters.limit)
    return roles
  }

  async create(role: Role) {
    const newRole = new Role()
    newRole.roleName = role.roleName
    newRole.roleDescription = role.roleDescription
    newRole.roleSlug = role.roleSlug
    newRole.roleActive = role.roleActive
    newRole.roleBusinessAccess = role.roleBusinessAccess
    await newRole.save()
    return newRole
  }

  async update(currentRole: Role, role: Role) {
    currentRole.roleName = role.roleName
    currentRole.roleDescription = role.roleDescription
    currentRole.roleSlug = role.roleSlug
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

  async show(roleId: number) {
    const role = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_id', roleId)
      .preload('roleSystemPermissions')
      .first()
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

    const query = Role.query()
      .where('role_name', role.roleName)
      .whereNull('role_deleted_at')

    if (role.roleId > 0) {
      query.whereNot('role_id', role.roleId)
    }

    const rolesWithSameName = await query

    const inputAccess = role.roleBusinessAccess
      ? role.roleBusinessAccess.split(',').map(e => e.trim())
      : []

    const hasConflict = rolesWithSameName.some(existingRole => {
      const existingAccess = existingRole.roleBusinessAccess
        ? existingRole.roleBusinessAccess.split(',').map(e => e.trim())
        : []

      return inputAccess.some(company => existingAccess.includes(company))
    })

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
   * Busca un rol por su slug
   * @param roleSlug - Slug del rol a buscar
   * @returns Rol encontrado o null
   */
  async findRoleBySlug(roleSlug: string, allowedBusinessUnitIds: number[] = []): Promise<Role | null> {
    // Los roles de sistema resuelven directo, sin depender del CSV
    // role_business_access: son asignables en todo tenant (USRH1785436961936).
    // `orderBy` fija la fila sembrada (la más antigua) ante cualquier residuo
    // histórico con slug duplicado.
    if (isSystemRoleSlug(roleSlug)) {
      return (
        (await Role.query()
          .where('role_slug', roleSlug)
          .whereNull('role_deleted_at')
          .orderBy('role_id', 'asc')
          .first()) || null
      )
    }

    let slugs: string[]
    if (allowedBusinessUnitIds.length === 0) {
      const allUnits = await BusinessUnit.query()
        .where('business_unit_active', 1)
        .select('business_unit_slug')
      slugs = allUnits.map((bu) => bu.businessUnitSlug)
    } else {
      const units = await BusinessUnit.query()
        .whereIn('business_unit_id', allowedBusinessUnitIds)
        .select('business_unit_slug')
      slugs = units.map((bu) => bu.businessUnitSlug)
    }

    if (slugs.length === 0) return null

    const role = await Role.query()
      .where('role_slug', roleSlug)
      .whereNull('role_deleted_at')
      .andWhere((query) => {
        query.whereNotNull('role_business_access')
        query.andWhere((subQuery) => {
          slugs.forEach((slug) => {
            subQuery.orWhereRaw('FIND_IN_SET(?, role_business_access)', [slug.trim()])
          })
        })
      })
      .first()

    return role || null
  }

}
