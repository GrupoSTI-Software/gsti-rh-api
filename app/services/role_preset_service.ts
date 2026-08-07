import SystemPermission from '#models/system_permission'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
import {
  ROLE_PRESET_MODULE_SLUG,
  ROLE_PRESETS,
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
}
