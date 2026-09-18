import Role from '#models/role'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import type {
  FlatSystemModuleDeclaration,
  SystemModuleGroupDeclaration,
} from '#constants/system_modules_menu/system_modules.constant'

/**
 * Resolución del catálogo por slug. La usan los seeders para escribir y
 * `permissions:check-consistency` para comparar sin escribir: los dos parten
 * de `buildSystemModuleGroupSeedValues` y `buildSystemModuleSeedValues`, así la
 * revisión reporta exactamente lo que la siembra cambiaría.
 *
 * Existe porque `system_module_id`, `system_permission_id` y `role_id` son
 * columnas autoincrementales que los seeders por módulo (hoy retirados)
 * escribían a mano. Cuando dos reclamaban el mismo número el segundo no
 * fallaba: hacía `updateOrCreate` por ese id y sobrescribía al primero en
 * silencio. Así desaparecieron cinco módulos —complaints, consent-evidence,
 * legal-documents, telework-workers y calendar— y el rol `super-administrador`,
 * cuyo id 1 se lo quedó `kiosco` al crearlo una migración sobre una tabla vacía.
 *
 * Contrato garantizado — el llamador puede confiar en estos invariantes:
 *
 *   LA IDENTIDAD ES EL SLUG.  Ningún seeder vuelve a escribir un id literal,
 *   así que dos seeders no pueden pisarse: si el slug no existe se crea, y si
 *   existe se actualiza esa misma fila.
 *
 *   NUNCA DEGRADA A SILENCIO.  Una referencia que no resuelve —un rol o un
 *   módulo que el seeder esperaba encontrar— lanza nombrando lo que falta, en
 *   vez de sembrar parcial o colgar filas del dueño equivocado.
 *
 *   TOLERA LA BAJA LÓGICA.  Las búsquedas usan `withTrashed()`: una fila dada
 *   de baja ocupa la PK pero el scope de SoftDeletes la oculta, lo que
 *   provocaba un INSERT duplicado al re-ejecutar el seeder. Nunca se revive un
 *   registro dado de baja: se actualizan sus datos sin tocar `deletedAt`.
 */

/** Campos del rol que un seeder declara. El id nunca se declara. */
export interface RoleSeedValues {
  roleName: string
  roleSlug: string
  roleDescription: string
  roleActive: number
}

/** Campos del grupo que siembra `0061_system_module_group_seeder`. El id nunca se declara. */
export interface SystemModuleGroupSeedValues {
  systemModuleGroupName: string
  systemModuleGroupKey: string
  systemModuleGroupOrder: number
  systemModuleGroupIcon: string
}

/** Campos del módulo que un seeder declara. El id nunca se declara. */
export interface SystemModuleSeedValues {
  systemModuleName: string
  systemModuleSlug: string
  systemModuleDescription: string
  systemModules: string
  systemModulePath: string
  systemModuleActive: number
  systemModuleOrder: number
  systemModuleGroupId: number | null
  systemModulePermissionEnforcementActive: boolean
  systemModuleIcon: string
}

/** Campos del permiso que un seeder declara. El id nunca se declara. */
export interface SystemPermissionSeedValues {
  systemPermissionName: string
  systemPermissionSlug: string
}

/**
 * Valores que `0061_system_module_group_seeder` escribe para un grupo declarado.
 *
 * Función pura: `permissions:check-consistency` la usa para comparar contra BD
 * lo mismo que la siembra escribe, sin mantener una segunda lista de campos.
 */
export function buildSystemModuleGroupSeedValues(
  group: Omit<SystemModuleGroupDeclaration, 'modules'>
): SystemModuleGroupSeedValues {
  return {
    systemModuleGroupName: group.name,
    systemModuleGroupKey: group.key,
    systemModuleGroupOrder: group.order,
    systemModuleGroupIcon: group.icon,
  }
}

/**
 * Valores que `0062_system_module_seeder` escribe para un módulo declarado.
 *
 * Función pura, compartida con `permissions:check-consistency` por la misma
 * razón que la de grupos.
 *
 * @param systemModule  Entrada de la vista plana `SYSTEM_MODULES`.
 * @param groupIdByKey  Ids de los grupos vivos por clave. Una clave sin id da
 *                      `null`: 0062 lanza antes de llegar aquí y la revisión
 *                      reporta ese grupo por separado.
 */
export function buildSystemModuleSeedValues(
  systemModule: FlatSystemModuleDeclaration,
  groupIdByKey: ReadonlyMap<string, number>
): SystemModuleSeedValues {
  return {
    systemModuleName: systemModule.systemModuleName,
    systemModuleSlug: systemModule.systemModuleSlug,
    systemModuleDescription: systemModule.systemModuleDescription,
    systemModules: String(systemModule.systemModules),
    systemModulePath: systemModule.systemModulePath,
    systemModuleActive: systemModule.systemModuleActive,
    systemModuleOrder: systemModule.systemModuleOrder,
    systemModuleGroupId: systemModule.systemModuleGroupKey
      ? groupIdByKey.get(systemModule.systemModuleGroupKey) ?? null
      : null,
    systemModulePermissionEnforcementActive: systemModule.systemModulePermissionEnforcementActive,
    systemModuleIcon: systemModule.systemModuleIcon,
  }
}

/**
 * Da de alta o actualiza un rol identificándolo por su slug y devuelve su id.
 *
 * `0006_role_seeder` buscaba `role_id = 1` antes que el slug. Como la migración
 * `1788500000000_grant_biometric_face_read_to_admin_roles` crea `kiosco` sin id
 * sobre una tabla vacía, el 1 se lo quedaba `kiosco`, el seeder concluía que
 * `super-administrador` ya existía y nunca lo creaba.
 */
export async function upsertRoleBySlug(
  values: RoleSeedValues,
  seederName: string
): Promise<number> {
  if (!values.roleSlug) {
    throw new Error(`[${seederName}] Un rol no puede sembrarse sin slug.`)
  }

  const existing = await Role.query().withTrashed().where('roleSlug', values.roleSlug).first()

  if (existing) {
    // Se actualizan los datos sin tocar deletedAt: un rol retirado no revive
    // por re-ejecutar el seeder.
    existing.merge(values)
    await existing.save()
    return existing.roleId
  }

  const created = await Role.create(values)
  return created.roleId
}

/**
 * Da de alta o actualiza un módulo identificándolo por su slug y devuelve su id.
 *
 * @param values      Declaración completa del módulo, sin `systemModuleId`.
 * @param seederName  Nombre del seeder llamador, para que el mensaje de error
 *                    diga de inmediato qué seeder falló.
 */
export async function upsertSystemModuleBySlug(values: SystemModuleSeedValues, seederName: string): Promise<number> {
  if (!values.systemModuleSlug) {
    throw new Error(`[${seederName}] Un módulo no puede sembrarse sin slug.`)
  }

  // Puede haber una fila viva y varias dadas de baja con el mismo slug (el
  // UNIQUE solo cubre las vivas). Se prefiere la viva y luego el menor id, la
  // misma regla con la que `permissions:check-consistency` elige la fila: si
  // no, la siembra podría actualizar la dada de baja y el hallazgo nunca se iría.
  const existing = await SystemModule.query()
    .withTrashed()
    .where('systemModuleSlug', values.systemModuleSlug)
    .orderByRaw('system_module_deleted_at IS NULL DESC')
    .orderBy('system_module_id')
    .first()

  if (existing) {
    // Se actualizan los datos sin tocar deletedAt: un módulo retirado no
    // revive por re-ejecutar el seeder.
    existing.merge(values)
    await existing.save()
    return existing.systemModuleId
  }

  const created = await SystemModule.create(values)
  return created.systemModuleId
}

/**
 * Da de baja lógica un módulo que la constante declara retirado. Si ya estaba
 * dado de baja no hace nada: re-ejecutar el seeder no mueve la fecha de baja.
 */
export async function retireSystemModule(systemModuleId: number): Promise<void> {
  const systemModule = await SystemModule.query()
    .withTrashed()
    .where('systemModuleId', systemModuleId)
    .firstOrFail()

  if (systemModule.deletedAt) {
    return
  }

  await systemModule.delete()
}

/**
 * Da de alta o actualiza los permisos de un módulo identificándolos por el par
 * (módulo, slug), y devuelve un mapa slug → id para que el llamador conceda
 * permisos sin conocer ningún id literal.
 */
export async function upsertSystemPermissionsBySlug(
  systemModuleId: number,
  permissions: SystemPermissionSeedValues[],
  seederName: string
): Promise<Map<string, number>> {
  const permissionIdBySlug = new Map<string, number>()

  for (const permission of permissions) {
    if (!permission.systemPermissionSlug) {
      throw new Error(
        `[${seederName}] Un permiso del módulo ${systemModuleId} no puede sembrarse sin slug.`
      )
    }

    // Viva primero y luego menor id: misma regla que la revisión de consistencia.
    const existing = await SystemPermission.query()
      .withTrashed()
      .where('systemModuleId', systemModuleId)
      .where('systemPermissionSlug', permission.systemPermissionSlug)
      .orderByRaw('system_permission_deleted_at IS NULL DESC')
      .orderBy('system_permission_id')
      .first()

    if (existing) {
      existing.merge({ ...permission, systemModuleId })
      await existing.save()
      permissionIdBySlug.set(permission.systemPermissionSlug, existing.systemPermissionId)
      continue
    }

    const created = await SystemPermission.create({ ...permission, systemModuleId })
    permissionIdBySlug.set(permission.systemPermissionSlug, created.systemPermissionId)
  }

  return permissionIdBySlug
}

/**
 * Resuelve ids de rol a partir de slugs estables.
 *
 * Los seeders concedían permisos con `roleIds = [1, 2]` documentando que el 1
 * era `super-administrador`; en cualquier base creada desde cero el 1 es
 * `kiosco`, la terminal compartida de asistencia, que heredó así 42 permisos
 * ajenos. Con esta resolución el destinatario deja de depender del id.
 *
 * Lanza nombrando los slugs faltantes: un rol que no existe es un error de
 * siembra, nunca una concesión que se omite en silencio.
 */
export async function resolveRoleIdsBySlug(
  slugs: string[],
  seederName: string
): Promise<Map<string, number>> {
  const uniqueSlugs = [...new Set(slugs)]

  if (uniqueSlugs.length === 0) {
    return new Map()
  }

  const roles = await Role.query().withTrashed().whereIn('roleSlug', uniqueSlugs)
  const roleIdBySlug = new Map(roles.map((role) => [role.roleSlug, role.roleId]))

  const missingSlugs = uniqueSlugs.filter((slug) => !roleIdBySlug.has(slug))
  if (missingSlugs.length > 0) {
    throw new Error(
      `[${seederName}] Rol(es) no encontrado(s) por slug: ${missingSlugs.sort().join(', ')}. ` +
      'Verifica que 0006_role_seeder haya corrido antes.'
    )
  }

  return roleIdBySlug
}

/**
 * Resuelve el id de un módulo por su slug, para seeders que solo lo referencian
 * (conceden permisos, lo vinculan a un system_setting) sin declararlo.
 */
export async function resolveSystemModuleIdsBySlug(
  slugs: string[],
  seederName: string
): Promise<Map<string, number>> {
  const uniqueSlugs = [...new Set(slugs)]

  if (uniqueSlugs.length === 0) {
    return new Map()
  }

  const modules = await SystemModule.query().withTrashed().whereIn('systemModuleSlug', uniqueSlugs)
  const moduleIdBySlug = new Map(modules.map((m) => [m.systemModuleSlug, m.systemModuleId]))

  const missingSlugs = uniqueSlugs.filter((slug) => !moduleIdBySlug.has(slug))
  if (missingSlugs.length > 0) {
    throw new Error(
      `[${seederName}] Módulo(s) no encontrado(s) por slug: ${missingSlugs.sort().join(', ')}. ` +
      'Verifica que el seeder que los declara haya corrido antes.'
    )
  }

  return moduleIdBySlug
}
