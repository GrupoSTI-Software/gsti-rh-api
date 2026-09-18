/**
 * Roles que toda empresa estrena al nacer: dueño, administrador y colaborador.
 *
 * Qué resuelve: hasta ahora `owner` y `empleado` eran una sola fila global
 * compartida por todos los clientes y `admin` no existía —cada cliente armaba
 * su administrador a mano—. Con `roles.business_unit_id` cada empresa tiene su
 * propio juego, sembrado dentro de la misma transacción que la crea.
 *
 * LOS SLUGS NO CAMBIAN. El runtime decide por slug en decenas de puntos
 * (`permission_gate_identity.ts`, los guards `roleSlug === 'root'`, el bloqueo
 * de login del colaborador), y el candado de identidad de `1789528501204` es
 * el par (empresa, slug): dos empresas pueden tener cada una su `owner` sin
 * chocar. Sembrar con los mismos slugs deja todo ese runtime intacto.
 *
 * `root` NO está aquí: es la cuenta de plataforma, global y sin empresa dueña
 * (`0006_role_seeder`, `SYSTEM_ROLE_SLUGS`).
 */

import {
  SYSTEM_MODULES,
  type FlatSystemModuleDeclaration,
} from '#constants/system_modules_menu/system_modules.constant'

export const TENANT_ROLE_SLUGS = ['owner', 'admin', 'empleado'] as const

export type TenantRoleSlug = (typeof TENANT_ROLE_SLUGS)[number]

export function isTenantRoleSlug(slug: string | null | undefined): slug is TenantRoleSlug {
  return !!slug && (TENANT_ROLE_SLUGS as readonly string[]).includes(slug)
}

/**
 * Cómo nace la matriz de permisos de un rol sembrado.
 *
 *  - `bypass`: sin filas en `role_system_permissions`. Su acceso no viene de la
 *    matriz sino del salvoconducto por slug del gate
 *    (`hasPermissionGateBypass`, bypass `standard`). Es el caso de `owner`.
 *  - `none`: sin permisos y sin salvoconducto. Es el caso de `empleado`, que
 *    por definición no entra al backoffice.
 *  - `fullCatalog`: todos los permisos vivos de los módulos vivos y activos del
 *    catálogo, concedidos EXPLÍCITAMENTE. Es el caso de `admin`.
 */
export type TenantRoleGrantStrategy = 'bypass' | 'none' | 'fullCatalog'

export interface TenantRoleDefinition {
  slug: TenantRoleSlug
  name: string
  description: string
  grants: TenantRoleGrantStrategy
}

export const TENANT_PROVISIONED_ROLES: readonly TenantRoleDefinition[] = [
  {
    slug: 'owner',
    name: 'Dueño',
    description: 'Dueño de la cuenta contratada (acceso total a su empresa y a la facturación)',
    // Sin matriz: el gate lo deja pasar por slug. Darle permisos explícitos
    // además del salvoconducto solo duplicaría la fuente de la decisión.
    grants: 'bypass',
  },
  {
    slug: 'admin',
    name: 'Administrador',
    description: 'Administra toda la operación de la empresa, salvo la facturación',
    // Permisos reales y revocables, no salvoconducto: el dueño puede quitarle
    // lo que quiera y el techo de concesión (`role_grant_ceiling.ts`) impide
    // que reparta lo que ya no tenga. Deliberadamente NO recibe el trato
    // especial de `owner` ni el de `super-administrador`, que son los dos
    // slugs que abren facturación y REPSE.
    grants: 'fullCatalog',
  },
  {
    slug: 'empleado',
    name: 'Empleado',
    description: 'Colaborador sin acceso al backoffice',
    grants: 'none',
  },
]

/**
 * Slugs de módulo cuyos permisos NO entran en la matriz del administrador.
 *
 * Hoy está vacío a propósito y es el punto único donde se excluiría un módulo:
 * la facturación del tenant no vive en el catálogo de módulos —no tiene
 * permisos que conceder o negar—, así que dejarla fuera del administrador es
 * cosa del gate de sus rutas, no de esta lista.
 */
export const TENANT_ADMIN_EXCLUDED_MODULE_SLUGS: readonly string[] = []

/**
 * Slugs de permiso que el administrador recibe al nacer, derivados del catálogo
 * fuente y nunca de ids fijos: un módulo nuevo entra solo, y uno retirado o
 * apagado sale solo.
 *
 * Se devuelve el par (módulo, permiso) porque el slug de un permiso solo es
 * único dentro de su módulo.
 */
export interface TenantAdminGrant {
  moduleSlug: string
  permissionSlug: string
}

export function buildTenantAdminGrants(): TenantAdminGrant[] {
  const excluded = new Set(TENANT_ADMIN_EXCLUDED_MODULE_SLUGS)

  // Se lee por la interfaz y no por la inferencia literal del catálogo: hoy
  // ningún módulo está marcado como retirado, y comparar contra el literal
  // `false` haría que TypeScript diera el filtro por imposible.
  const modules: readonly FlatSystemModuleDeclaration[] = SYSTEM_MODULES

  return modules.filter(
    (systemModule) =>
      systemModule.systemModuleActive === 1 &&
      !systemModule.systemModuleRetired &&
      !excluded.has(systemModule.systemModuleSlug)
  ).flatMap((systemModule) =>
    systemModule.systemModulePermissions.map((permission) => ({
      moduleSlug: systemModule.systemModuleSlug,
      permissionSlug: permission.systemPermissionSlug,
    }))
  )
}
