import Role from '#models/role'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'

/**
 * Resolución del catálogo por slug, para uso exclusivo de seeders.
 *
 * Existe porque `system_module_id`, `system_permission_id` y `role_id` son
 * columnas autoincrementales que 17 seeders escribían a mano. Cuando dos
 * reclamaban el mismo número el segundo no fallaba: hacía `updateOrCreate` por
 * ese id y sobrescribía al primero en silencio. Así desaparecieron cinco
 * módulos —complaints, consent-evidence, legal-documents, telework-workers y
 * calendar— y el rol `super-administrador`, cuyo id 1 se lo quedó `kiosco` al
 * crearlo una migración sobre una tabla vacía.
 *
 * Contrato garantizado — el llamador puede confiar en estos invariantes,
 * heredados de `resolveSystemModuleGroupIds`:
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
 *   provocaba un INSERT duplicado al re-ejecutar el seeder (molde
 *   `0017_system_module_seeder.ts:893-899`). Nunca se revive un registro dado
 *   de baja: se actualizan sus datos sin tocar `deletedAt`.
 */

/** Campos del rol que un seeder declara. El id nunca se declara. */
export interface RoleSeedValues {
  roleName: string
  roleSlug: string
  roleDescription: string
  roleActive: number
  roleBusinessAccess: string
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
  systemModuleIcon: string
}

/** Campos del permiso que un seeder declara. El id nunca se declara. */
export interface SystemPermissionSeedValues {
  systemPermissionName: string
  systemPermissionSlug: string
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
 * @param seederName  Nombre del seeder llamador, para que con 17 llamadores el
 *                    mensaje de error diga de inmediato quién falló.
 */
export async function upsertSystemModuleBySlug(
  values: SystemModuleSeedValues,
  seederName: string
): Promise<number> {
  if (!values.systemModuleSlug) {
    throw new Error(`[${seederName}] Un módulo no puede sembrarse sin slug.`)
  }

  const existing = await SystemModule.query()
    .withTrashed()
    .where('systemModuleSlug', values.systemModuleSlug)
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

    const existing = await SystemPermission.query()
      .withTrashed()
      .where('systemModuleId', systemModuleId)
      .where('systemPermissionSlug', permission.systemPermissionSlug)
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
