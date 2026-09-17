import type { HttpContext } from '@adonisjs/core/http'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import { evaluateSecondaryEnforcedDecision } from '#helpers/permission_gate_secondary'

/** Clave del contrato de error cuando el actor reparte más de lo que tiene. */
export const GRANT_CEILING_ERROR_KEY = 'permiso-fuera-de-alcance'

/** Permiso que el actor pidió conceder y que él mismo no tiene. */
export interface UngrantablePermission {
  systemPermissionId: number
  /** `null` si el permiso o su módulo no resuelven a una fila viva y activa. */
  systemModuleSlug: string | null
  systemPermissionSlug: string | null
}

/**
 * Techo de concesión: nadie reparte permisos que él mismo no tiene.
 *
 * Sin esto, cualquiera con `roles-and-permissions:update` podía crear un rol,
 * asignarle CUALQUIER id de permiso del catálogo y entrar con ese rol: el
 * gate solo preguntaba si podía administrar roles, nunca hasta dónde.
 *
 * "Lo que él mismo tiene" se decide con el mecanismo de permisos efectivos del
 * repo —`PermissionGateService`, vía `evaluateSecondaryEnforcedDecision`— y no
 * con una consulta propia a `role_system_permissions`: así el techo hereda los
 * salvoconductos (root de plataforma y dueño de la cuenta pasan con
 * `bypass: 'standard'`) y cualquier cambio futuro de la identidad de permisos
 * se aplica aquí sin tocar este archivo.
 *
 * Se evalúa con `evaluateEnforced` a propósito: con `evaluate`, un módulo con
 * la exigencia apagada en BD respondería `module-not-enforced` y dejaría que
 * cualquiera repartiera sus permisos, que es justo el agujero que se cierra.
 *
 * Solo se revisa el DELTA (lo que se concede de nuevo). Conservar un permiso
 * que el rol ya tenía no es conceder nada, y revisarlo impediría que un
 * administrador guardara la matriz de un rol más poderoso sin desarmarlo
 * primero. Revocar tampoco pasa por aquí: quitar permisos no escala a nadie.
 *
 * Fail-closed: un id que no resuelve a un permiso vivo de un módulo vivo y
 * activo se reporta como fuera de alcance; nadie "tiene" un permiso fantasma.
 *
 * @param requestedPermissionIds Ids que quedarían asignados al rol.
 * @param targetRoleId Rol destino, o `null` si aún no existe (alta con plantilla).
 */
export async function findPermissionsAboveActorCeiling(
  ctx: HttpContext,
  requestedPermissionIds: readonly unknown[] | undefined,
  targetRoleId: number | null
): Promise<UngrantablePermission[]> {
  const requested = normalizePermissionIds(requestedPermissionIds)
  if (requested.length === 0) {
    return []
  }

  const current = targetRoleId === null ? [] : await loadLiveGrantIds(targetRoleId)
  const currentIds = new Set(current)
  const delta = requested.filter((id) => !currentIds.has(id))
  if (delta.length === 0) {
    return []
  }

  const permissions = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .whereIn('system_permission_id', delta)
  const permissionById = new Map(
    permissions.map((permission) => [permission.systemPermissionId, permission])
  )

  const moduleIds = [...new Set(permissions.map((permission) => permission.systemModuleId))]
  const modules =
    moduleIds.length === 0
      ? []
      : await SystemModule.query()
          .whereNull('system_module_deleted_at')
          .where('system_module_active', 1)
          .whereIn('system_module_id', moduleIds)
  const moduleSlugById = new Map(
    modules.map((systemModule) => [systemModule.systemModuleId, systemModule.systemModuleSlug])
  )

  const breaches: UngrantablePermission[] = []
  for (const systemPermissionId of delta) {
    const permission = permissionById.get(systemPermissionId)
    const moduleSlug = permission ? moduleSlugById.get(permission.systemModuleId) : undefined

    if (!permission || moduleSlug === undefined) {
      breaches.push({
        systemPermissionId,
        systemModuleSlug: moduleSlug ?? null,
        systemPermissionSlug: permission?.systemPermissionSlug ?? null,
      })
      continue
    }

    const decision = await evaluateSecondaryEnforcedDecision(ctx, {
      module: moduleSlug,
      action: permission.systemPermissionSlug,
      bypass: 'standard',
    })
    if (!decision.allowed) {
      breaches.push({
        systemPermissionId,
        systemModuleSlug: moduleSlug,
        systemPermissionSlug: permission.systemPermissionSlug,
      })
    }
  }

  return breaches
}

/**
 * Cuerpo 403 del techo de concesión, en un solo lugar para que la asignación
 * simple, el lote y las plantillas respondan igual.
 *
 * @param role Rol del lote que disparó la negativa, cuando el caller lo conoce.
 */
export function buildGrantCeilingDenial(
  i18n: HttpContext['i18n'],
  breaches: readonly UngrantablePermission[],
  role: { roleId: number; roleName: string } | null = null
) {
  return {
    title: i18n.formatMessage('role_permission_above_ceiling_title'),
    detail: role
      ? i18n.formatMessage('role_permission_above_ceiling_batch_detail', {
          roleName: role.roleName,
        })
      : i18n.formatMessage('role_permission_above_ceiling_detail'),
    key: GRANT_CEILING_ERROR_KEY,
    data: {
      ...(role ? { roleId: role.roleId, roleName: role.roleName } : {}),
      permissions: breaches.map((breach) => ({
        systemPermissionId: breach.systemPermissionId,
        systemModuleSlug: breach.systemModuleSlug,
        systemPermissionSlug: breach.systemPermissionSlug,
      })),
    },
  }
}

/** Ids vivos que el rol ya tiene concedidos. */
async function loadLiveGrantIds(roleId: number): Promise<number[]> {
  const grants = await RoleSystemPermission.query()
    .whereNull('role_system_permission_deleted_at')
    .where('role_id', roleId)

  return grants.map((grant) => grant.systemPermissionId)
}

/** Marca de id que no puede existir en el catálogo (la PK es autoincremental). */
const INVALID_PERMISSION_ID = -1

/**
 * El payload de asignación llega sin tipar (`request.all()`), así que se
 * normaliza igual que lo hace `RoleService.assignPermissions` antes de guardar.
 * Lo que no sea un entero positivo se conserva como id inválido —y sale fuera
 * de alcance— en lugar de descartarse en silencio.
 */
function normalizePermissionIds(permissionIds: readonly unknown[] | undefined): number[] {
  if (!Array.isArray(permissionIds)) {
    return []
  }

  const normalized = permissionIds.map((value) => {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : INVALID_PERMISSION_ID
  })

  return [...new Set(normalized)]
}
