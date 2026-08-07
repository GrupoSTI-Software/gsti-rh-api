import RoleService from '#services/role_service'
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

const roleService = new RoleService()
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
      .whereHas('systemModule', (query) => {
        query
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

    const roleAccess = await roleService.getAccess(roleId)
    if (roleAccess.status !== 200) {
      throw new Error(`No se pudo cargar el rol ${roleId} para generar la vista previa.`)
    }

    const currentGrants = (roleAccess.data ?? []) as RoleSystemPermission[]
    const currentIds = this.sortUniqueIds(currentGrants.map((grant) => grant.systemPermissionId))
    const currentEmployeesGrants = currentGrants
      .filter(
        (grant) =>
          grant.systemPermissions.systemModule.systemModuleSlug === ROLE_PRESET_MODULE_SLUG
      )
      .sort((a, b) => a.systemPermissionId - b.systemPermissionId)

    const currentEmployeesIds = this.sortUniqueIds(
      currentEmployeesGrants.map((grant) => grant.systemPermissionId)
    )
    const allEmployeesPermissionIds = await this.loadAllEmployeesPermissionIds()
    const desiredIds = this.computeDesiredPermissionIds({
      mode,
      currentIds,
      presetEmployeesIds,
      allEmployeesPermissionIds,
    })
    const desiredEmployeesIds = desiredIds.filter((id) =>
      allEmployeesPermissionIds.includes(id)
    )

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
      .map((systemPermissionId) => this.buildPreviewItemFromPresetId(systemPermissionId, presetSlugById))

    const revoked = currentEmployeesIds
      .filter((id) => !desiredEmployeesSet.has(id))
      .map((systemPermissionId) => this.buildPreviewItemFromCurrentGrant(systemPermissionId, currentEmployeesGrants))

    const unchanged = currentEmployeesIds
      .filter((id) => desiredEmployeesSet.has(id))
      .map((systemPermissionId) => this.buildPreviewItemFromCurrentGrant(systemPermissionId, currentEmployeesGrants))

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

  private sortUniqueIds(ids: number[]): number[] {
    return [...new Set(ids)].sort((a, b) => a - b)
  }

  private async loadAllEmployeesPermissionIds(): Promise<number[]> {
    const permissions = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .whereHas('systemModule', (query) => {
        query
          .whereNull('system_module_deleted_at')
          .where('system_module_slug', ROLE_PRESET_MODULE_SLUG)
      })
      .select('system_permission_id')

    return this.sortUniqueIds(permissions.map((permission) => permission.systemPermissionId))
  }

  private buildPreviewItemFromPresetId(
    systemPermissionId: number,
    presetSlugById: Map<number, string>
  ): RolePresetPreviewItem {
    const slug = presetSlugById.get(systemPermissionId)
    if (!slug) {
      throw new Error(`No se pudo resolver el slug de la plantilla para el permiso ${systemPermissionId}.`)
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
