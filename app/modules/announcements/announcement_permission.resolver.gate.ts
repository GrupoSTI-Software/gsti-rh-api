import type User from '#models/user'
import PermissionGateService from '#services/permission_gate_service'
import { parsePermissionKey } from './domain/permission_key.js'
import type { AnnouncementPermissionResolver } from './announcement_permission.resolver.js'

/**
 * Resuelve con el mismo mecanismo que `middleware.permissionGate`
 * (`PermissionGateService`): identidad del rol, salvoconducto `standard` (root y
 * owner ven todo) y concesiones reales del rol.
 *
 * Usa `evaluateEnforced`, no `evaluate`: la visibilidad de un slide sigue a la
 * concesión, como la pantalla del BO, aunque el API no exija aún ese módulo. Con
 * `evaluate`, un módulo sin exigencia mostraría el slide a cualquier autenticado.
 */
export default class AnnouncementPermissionResolverGate implements AnnouncementPermissionResolver {
  async grantedKeys(user: User, permissionKeys: readonly string[]): Promise<Set<string>> {
    // Una instancia por llamada: cachea rol y concesiones solo durante esta petición.
    const gate = new PermissionGateService()
    const granted = new Set<string>()

    for (const permissionKey of permissionKeys) {
      const parsed = parsePermissionKey(permissionKey)
      if (!parsed) continue

      const decision = await gate.evaluateEnforced(user, {
        module: parsed.moduleSlug,
        action: parsed.permissionSlug,
        bypass: 'standard',
      })
      if (decision.allowed) granted.add(permissionKey)
    }

    return granted
  }
}
