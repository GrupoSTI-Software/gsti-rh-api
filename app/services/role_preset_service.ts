import RoleService from '#services/role_service'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
import {
  ROLE_PRESET_MODULE_SLUG,
  type RolePresetMode,
  ROLE_PRESETS,
  getRolePreset,
  type RolePresetSlug,
} from '#constants/role_presets'
import { ROLE_PRESET_ERROR_CODES } from '#constants/role_preset_error_codes'
import { RolePresetServiceError } from '#exceptions/role_preset_service_error'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export interface RolePresetListPermissionItem {
  slug: string
  displayName: string
  section: string
  kind: string
}

export interface RolePresetListItem {
  slug: RolePresetSlug
  name: string
  description: string
  version: string
  permissionCount: number
  permissions: RolePresetListPermissionItem[]
}

export interface RolePresetPreviewItem {
  systemPermissionId: number
  slug: string
  displayName: string
  section: string
  kind: 'read' | 'write' | 'delete'
  moduleSlug: string
}

export interface RolePresetPreview {
  preset: {
    slug: string
    name: string
    description: string
    version: string
    permissionCount: number
  }
  mode: RolePresetMode
  baselinePermissionIds: number[]
  granted: RolePresetPreviewItem[]
  revoked: RolePresetPreviewItem[]
  unchanged: RolePresetPreviewItem[]
}

export interface RolePresetApplyInput {
  presetSlug: RolePresetSlug
  mode: RolePresetMode
  expectedPresetVersion: string
  baselinePermissionIds: number[]
}

const EMPLOYEE_PERMISSION_BY_SLUG = new Map(
  EMPLOYEES_PERMISSION_CATALOG.map((permission) => [permission.slug, permission] as const)
)

export default class RolePresetService {
  list(): RolePresetListItem[] {
    return ROLE_PRESETS.map((preset) => {
      const permissions = preset.permissionSlugs.map((slug) => {
        const permission = EMPLOYEE_PERMISSION_BY_SLUG.get(slug)
        if (!permission) {
          throw new RolePresetServiceError(
            `La plantilla "${preset.slug}" referencia un permiso inexistente: ${slug}`,
            ROLE_PRESET_ERROR_CODES.MISSING_PERMISSIONS,
            422,
            'plantilla-permisos-faltantes',
            'Plantilla de rol incompleta',
            `La plantilla "${preset.slug}" referencia el permiso "${slug}" pero no existe en el catálogo de Empleados.`,
            { presetSlug: preset.slug, missing: [slug] }
          )
        }

        return {
          slug: permission.slug,
          displayName: permission.displayName,
          section: permission.section,
          kind: permission.kind,
        }
      })

      return {
        slug: preset.slug,
        name: preset.name,
        description: preset.description,
        version: preset.version,
        permissionCount: permissions.length,
        permissions,
      }
    })
  }

  async resolveEmployeesPermissionIds(
    slugs: readonly string[]
  ): Promise<{ ids: number[]; missing: string[] }> {
    const requestedSlugs = Array.from(new Set(slugs))

    if (requestedSlugs.length === 0) {
      return { ids: [], missing: [] }
    }

    const permissions = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .whereIn('system_permission_slug', requestedSlugs)
      .whereHas('systemModule', (moduleQuery) => {
        moduleQuery
          .whereNull('system_module_deleted_at')
          .where('system_module_slug', ROLE_PRESET_MODULE_SLUG)
      })

    const foundBySlug = new Map(
      permissions.map((permission) => [permission.systemPermissionSlug, permission])
    )
    const ids: number[] = []

    for (const slug of requestedSlugs) {
      const permission = foundBySlug.get(slug)
      if (permission) {
        ids.push(permission.systemPermissionId)
      }
    }

    const missing = slugs.filter((slug) => !foundBySlug.has(slug))

    return { ids, missing }
  }

  computeDesiredPermissionIds(args: {
    mode: RolePresetMode
    currentIds: number[]
    presetEmployeesIds: number[]
    allEmployeesPermissionIds: number[]
  }): number[] {
    const current = new Set(args.currentIds)
    const preset = new Set(args.presetEmployeesIds)
    const employees = new Set(args.allEmployeesPermissionIds)

    if (args.mode === 'merge') {
      return [...new Set([...current, ...preset])].sort((a, b) => a - b)
    }

    const nonEmployees = [...current].filter((id) => !employees.has(id))
    return [...new Set([...nonEmployees, ...preset])].sort((a, b) => a - b)
  }

  async preview(
    roleId: number,
    presetSlug: RolePresetSlug,
    mode: RolePresetMode
  ): Promise<RolePresetPreview> {
    let preset
    try {
      preset = getRolePreset(presetSlug)
    } catch {
      throw new RolePresetServiceError(
        `La plantilla solicitada no existe: ${presetSlug}`,
        ROLE_PRESET_ERROR_CODES.PRESET_NOT_FOUND,
        404,
        'plantilla-no-encontrada',
        'Plantilla de rol no encontrada',
        `No existe una plantilla de rol con slug "${presetSlug}".`,
        { presetSlug }
      )
    }

    const { ids: presetEmployeesIds, missing } = await this.resolveEmployeesPermissionIds(
      preset.permissionSlugs
    )
    if (missing.length > 0) {
      throw new RolePresetServiceError(
        `Faltan permisos de la plantilla "${preset.slug}" en la base de datos`,
        ROLE_PRESET_ERROR_CODES.MISSING_PERMISSIONS,
        422,
        'plantilla-permisos-faltantes',
        'Plantilla de rol incompleta',
        `La plantilla "${preset.slug}" referencia permisos que no existen en la base de datos.`,
        { presetSlug: preset.slug, missing }
      )
    }

    const currentGrants = await this.loadCurrentGrants(roleId)
    const currentIds = this.sortUniqueIds(currentGrants.map((grant) => grant.systemPermissionId))
    const allEmployeesPermissionIds = await this.loadAllEmployeesPermissionIds()
    const employeesLiveIds = new Set(allEmployeesPermissionIds)

    // Las listas visibles solo describen el catálogo vivo de Empleados; el
    // baseline en cambio lleva TODOS los ids asignados para que coincida con el
    // que `apply` vuelve a calcular.
    const currentEmployeesGrants = currentGrants
      .filter((grant) => employeesLiveIds.has(grant.systemPermissionId))
      .sort((a, b) => a.systemPermissionId - b.systemPermissionId)

    const currentEmployeesIds = this.sortUniqueIds(
      currentEmployeesGrants.map((grant) => grant.systemPermissionId)
    )
    const desiredIds = this.computeDesiredPermissionIds({
      mode,
      currentIds,
      presetEmployeesIds,
      allEmployeesPermissionIds,
    })
    const desiredEmployeesIds = desiredIds.filter((id) => employeesLiveIds.has(id))

    const currentEmployeesSet = new Set(currentEmployeesIds)
    const desiredEmployeesSet = new Set(desiredEmployeesIds)
    const presetSlugById = new Map<number, string>()
    preset.permissionSlugs.forEach((slug, index) => {
      const permissionId = presetEmployeesIds[index]
      if (permissionId !== undefined) {
        presetSlugById.set(permissionId, slug)
      }
    })

    const granted = desiredEmployeesIds
      .filter((id) => !currentEmployeesSet.has(id))
      .map((systemPermissionId) =>
        this.buildPreviewItemFromPresetId(systemPermissionId, presetSlugById)
      )

    const revoked = currentEmployeesIds
      .filter((id) => !desiredEmployeesSet.has(id))
      .map((systemPermissionId) =>
        this.buildPreviewItemFromCurrentGrant(systemPermissionId, currentEmployeesGrants)
      )

    const unchanged = currentEmployeesIds
      .filter((id) => desiredEmployeesSet.has(id))
      .map((systemPermissionId) =>
        this.buildPreviewItemFromCurrentGrant(systemPermissionId, currentEmployeesGrants)
      )

    return {
      preset: {
        slug: preset.slug,
        name: preset.name,
        description: preset.description,
        version: preset.version,
        permissionCount: preset.permissionSlugs.length,
      },
      mode,
      baselinePermissionIds: currentIds,
      granted,
      revoked,
      unchanged,
    }
  }

  async apply(
    roleId: number,
    input: RolePresetApplyInput,
    trx: TransactionClientContract
  ): Promise<{
    roleSystemPermissions: RoleSystemPermission[]
    appliedPreset: { slug: string; version: string }
  }> {
    await this.lockRole(roleId, trx)

    let preset
    try {
      preset = getRolePreset(input.presetSlug)
    } catch {
      throw new RolePresetServiceError(
        `La plantilla solicitada no existe: ${input.presetSlug}`,
        ROLE_PRESET_ERROR_CODES.PRESET_NOT_FOUND,
        404,
        'plantilla-no-encontrada',
        'Plantilla de rol no encontrada',
        `No existe una plantilla de rol con slug "${input.presetSlug}".`,
        { presetSlug: input.presetSlug }
      )
    }

    if (input.expectedPresetVersion !== preset.version) {
      throw new RolePresetServiceError(
        `La versión de la plantilla "${preset.slug}" quedó obsoleta`,
        ROLE_PRESET_ERROR_CODES.STALE_PRESET_VERSION,
        409,
        'plantilla-version-obsoleta',
        'Versión de plantilla obsoleta',
        `La plantilla "${preset.slug}" ya no coincide con la versión previsualizada.`,
        {
          presetSlug: preset.slug,
          expectedPresetVersion: input.expectedPresetVersion,
          version: preset.version,
        }
      )
    }

    const currentGrants = await this.loadCurrentGrants(roleId, trx, true)
    const currentIds = this.sortUniqueIds(currentGrants.map((grant) => grant.systemPermissionId))
    if (!this.sameIdSet(currentIds, input.baselinePermissionIds)) {
      throw new RolePresetServiceError(
        `Los permisos del rol "${roleId}" cambiaron desde la vista previa`,
        ROLE_PRESET_ERROR_CODES.STALE_ROLE_PERMISSIONS,
        409,
        'rol-permisos-cambiaron',
        'Permisos del rol cambiaron',
        'Los permisos actuales del rol ya no coinciden con la vista previa.',
        {
          roleId,
          baselinePermissionIds: input.baselinePermissionIds,
          currentPermissionIds: currentIds,
        }
      )
    }

    const { ids: presetEmployeesIds, missing } = await this.resolveEmployeesPermissionIds(
      preset.permissionSlugs
    )
    if (missing.length > 0) {
      throw new RolePresetServiceError(
        `Faltan permisos de la plantilla "${preset.slug}" en la base de datos`,
        ROLE_PRESET_ERROR_CODES.MISSING_PERMISSIONS,
        422,
        'plantilla-permisos-faltantes',
        'Plantilla de rol incompleta',
        `La plantilla "${preset.slug}" referencia permisos que no existen en la base de datos.`,
        { presetSlug: preset.slug, missing }
      )
    }

    const allEmployeesPermissionIds = await this.loadAllEmployeesPermissionIds(trx)
    const desired = this.computeDesiredPermissionIds({
      mode: input.mode,
      currentIds,
      presetEmployeesIds,
      allEmployeesPermissionIds,
    })
    const roleService = new RoleService()
    const roleSystemPermissions = await roleService.assignPermissions(roleId, desired, trx)

    return {
      roleSystemPermissions,
      appliedPreset: { slug: preset.slug, version: preset.version },
    }
  }

  private async loadCurrentGrants(
    roleId: number,
    trx?: TransactionClientContract,
    roleAlreadyLocked = false
  ): Promise<RoleSystemPermission[]> {
    if (!roleAlreadyLocked) {
      const roleQuery = Role.query().whereNull('role_deleted_at').where('role_id', roleId)
      if (trx) {
        roleQuery.useTransaction(trx)
      }
      if (!(await roleQuery.first())) {
        throw new RolePresetServiceError(
          `El rol solicitado no existe: ${roleId}`,
          ROLE_PRESET_ERROR_CODES.ROLE_NOT_FOUND,
          404,
          'rol-no-encontrado',
          'Rol no encontrado',
          `No existe un rol con id "${roleId}".`,
          { roleId }
        )
      }
    }

    // Se devuelven TODAS las asignaciones vivas del rol, incluidas las que
    // apuntan a un permiso o módulo con borrado lógico: `assignPermissions`
    // elimina cualquier fila fuera de la lista deseada, así que dejarlas fuera
    // del baseline haría que aplicar una plantilla las borrara en silencio.
    // La relación `systemPermissions` queda sin cargar en esas huérfanas (el
    // mixin de soft delete las filtra), por eso solo se desreferencia sobre
    // permisos vivos de Empleados.
    const grantsQuery = RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('role_id', roleId)
      .preload('systemPermissions', (query) => query.preload('systemModule'))
    if (trx) {
      grantsQuery.useTransaction(trx)
    }
    return grantsQuery
  }

  private async lockRole(roleId: number, trx: TransactionClientContract): Promise<Role> {
    const role = await Role.query()
      .useTransaction(trx)
      .forUpdate()
      .whereNull('role_deleted_at')
      .where('role_id', roleId)
      .first()
    if (!role) {
      throw new RolePresetServiceError(
        `El rol solicitado no existe: ${roleId}`,
        ROLE_PRESET_ERROR_CODES.ROLE_NOT_FOUND,
        404,
        'rol-no-encontrado',
        'Rol no encontrado',
        `No existe un rol con id "${roleId}".`,
        { roleId }
      )
    }
    return role
  }

  private sameIdSet(left: number[], right: number[]): boolean {
    const normalizedLeft = this.sortUniqueIds(left)
    const normalizedRight = this.sortUniqueIds(right)
    return (
      normalizedLeft.length === normalizedRight.length &&
      normalizedLeft.every((id, index) => id === normalizedRight[index])
    )
  }

  private sortUniqueIds(ids: number[]): number[] {
    return [...new Set(ids)].sort((a, b) => a - b)
  }

  private async loadAllEmployeesPermissionIds(trx?: TransactionClientContract): Promise<number[]> {
    const query = SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .whereHas('systemModule', (moduleQuery) => {
        moduleQuery
          .whereNull('system_module_deleted_at')
          .where('system_module_slug', ROLE_PRESET_MODULE_SLUG)
      })
      .select('system_permission_id')
    if (trx) {
      query.useTransaction(trx)
    }
    const permissions = await query

    return this.sortUniqueIds(permissions.map((permission) => permission.systemPermissionId))
  }

  private buildPreviewItemFromPresetId(
    systemPermissionId: number,
    presetSlugById: Map<number, string>
  ): RolePresetPreviewItem {
    const slug = presetSlugById.get(systemPermissionId)
    if (!slug) {
      throw new Error(
        `No se pudo resolver el slug de la plantilla para el permiso ${systemPermissionId}.`
      )
    }

    const catalogPermission = EMPLOYEE_PERMISSION_BY_SLUG.get(slug)
    if (!catalogPermission) {
      throw new Error(`No existe catálogo para el permiso de empleados "${slug}".`)
    }

    return {
      systemPermissionId,
      slug: catalogPermission.slug,
      displayName: catalogPermission.displayName,
      section: catalogPermission.section,
      kind: catalogPermission.kind,
      moduleSlug: ROLE_PRESET_MODULE_SLUG,
    }
  }

  private buildPreviewItemFromCurrentGrant(
    systemPermissionId: number,
    currentGrants: RoleSystemPermission[]
  ): RolePresetPreviewItem {
    const grant = currentGrants.find((item) => item.systemPermissionId === systemPermissionId)
    if (!grant) {
      throw new Error(`No se encontró el permiso actual ${systemPermissionId} en la vista previa.`)
    }

    const permission = grant.systemPermissions
    const catalogPermission = EMPLOYEE_PERMISSION_BY_SLUG.get(permission.systemPermissionSlug)
    if (!catalogPermission) {
      throw new Error(
        `No existe catálogo para el permiso de empleados "${permission.systemPermissionSlug}".`
      )
    }

    return {
      systemPermissionId,
      slug: catalogPermission.slug,
      displayName: catalogPermission.displayName,
      section: catalogPermission.section,
      kind: catalogPermission.kind,
      moduleSlug: permission.systemModule.systemModuleSlug,
    }
  }
}
