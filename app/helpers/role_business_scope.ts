import BusinessUnit from '#models/business_unit'
import type Role from '#models/role'
import { SYSTEM_ROLE_SLUGS, isSystemRoleSlug } from '#constants/system_roles'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

/**
 * Una sola representación de "qué roles alcanza la empresa activa".
 *
 * Un rol pertenece al alcance si cumple cualquiera de estas tres:
 *
 *  1. `roles.business_unit_id` está en el alcance. Es el criterio definitivo:
 *     lo escribe el alta de roles desde que existe la columna.
 *  2. Es un rol de sistema global (`SYSTEM_ROLE_SLUGS`) con
 *     `business_unit_id IS NULL`. Son de la plataforma y se ven en todo
 *     tenant. La condición sobre la columna es deliberada: cuando cada empresa
 *     tenga su propio `owner`, el slug dejará de ser salvoconducto para
 *     alcanzar el rol de otra empresa.
 *  3. COMPATIBILIDAD TEMPORAL — `business_unit_id IS NULL` y el CSV
 *     `role_business_access` nombra alguna empresa del alcance. Es como se
 *     distinguían los roles de cada cliente antes de esta columna. Sigue viva
 *     porque el backfill de los entornos con datos es otra historia: hasta que
 *     corra, los roles heredados solo resuelven por aquí. Sale cuando el
 *     rediseño de roles por empresa retire la columna CSV.
 *
 * Fail-closed: un rol con `business_unit_id IS NULL`, sin slug de sistema y sin
 * CSV no pertenece a ninguna empresa y no lo alcanza nadie.
 */
export interface RoleBusinessScope {
  /** Ids de las empresas del alcance (hoy, la empresa activa de la petición). */
  businessUnitIds: number[]
  /** Slugs de esas mismas empresas, solo para la compatibilidad con el CSV. */
  businessUnitSlugs: string[]
}

/**
 * Resuelve el alcance a partir de los ids que dejó `businessScope` en
 * `ctx.businessUnitScope`.
 */
export async function buildRoleBusinessScope(
  businessUnitIds: readonly number[]
): Promise<RoleBusinessScope> {
  if (businessUnitIds.length === 0) {
    return { businessUnitIds: [], businessUnitSlugs: [] }
  }

  const units = await BusinessUnit.query()
    .whereIn('business_unit_id', [...businessUnitIds])
    .select('business_unit_slug')

  return {
    businessUnitIds: [...businessUnitIds],
    businessUnitSlugs: units.map((unit) => unit.businessUnitSlug.trim()),
  }
}

/**
 * Acota una consulta de roles al alcance. Se aplica como un solo grupo `AND (…)`
 * para no contaminar el resto de condiciones de la consulta.
 */
export function applyRoleBusinessScope(
  query: ModelQueryBuilderContract<typeof Role>,
  scope: RoleBusinessScope
): void {
  query.andWhere((scoped) => {
    if (scope.businessUnitIds.length > 0) {
      scoped.orWhereIn('business_unit_id', scope.businessUnitIds)
    }

    scoped.orWhere((systemQuery) => {
      systemQuery.whereNull('business_unit_id').whereIn('role_slug', [...SYSTEM_ROLE_SLUGS])
    })

    if (scope.businessUnitSlugs.length === 0) {
      return
    }

    scoped.orWhere((legacyQuery) => {
      legacyQuery.whereNull('business_unit_id').whereNotNull('role_business_access')
      legacyQuery.andWhere((csvQuery) => {
        scope.businessUnitSlugs.forEach((slug) => {
          csvQuery.orWhereRaw('FIND_IN_SET(?, role_business_access)', [slug])
        })
      })
    })
  })
}

/**
 * Misma decisión que `applyRoleBusinessScope`, en memoria, para cuando el rol
 * ya está cargado. Las dos tienen que responder lo mismo.
 */
export function isRoleInBusinessScope(role: Role, scope: RoleBusinessScope): boolean {
  const owner = role.businessUnitId
  if (owner !== null && owner !== undefined) {
    return scope.businessUnitIds.includes(owner)
  }

  if (isSystemRoleSlug(role.roleSlug)) {
    return true
  }

  const access = role.roleBusinessAccess
    ? role.roleBusinessAccess.split(',').map((slug) => slug.trim())
    : []

  return scope.businessUnitSlugs.some((slug) => access.includes(slug))
}

/**
 * Empresa activa de la petición. `businessScope` deja exactamente un id en
 * `ctx.businessUnitScope` (el que resolvió del header `X-Business-Unit-Id`);
 * cualquier otra cosa es un alcance que no identifica empresa y devuelve
 * `null` para que el caller niegue, nunca para que elija una.
 */
export function resolveActiveBusinessUnitId(businessUnitScope: readonly number[]): number | null {
  return businessUnitScope.length === 1 ? businessUnitScope[0] : null
}
