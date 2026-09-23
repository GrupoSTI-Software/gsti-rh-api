import type Role from '#models/role'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

/**
 * Una sola representación de "qué roles alcanza la empresa activa".
 *
 * Un rol pertenece al alcance si su empresa dueña (`roles.business_unit_id`)
 * está en él. No hay más criterios: los roles globales de sistema y el CSV
 * `role_business_access` desaparecieron con el modelo de roles por empresa —el
 * primero porque cada empresa tiene ahora su propio `owner` y su propio
 * `empleado`, el segundo porque la pertenencia la dice la llave—.
 *
 * `root` no pasa por aquí: es de la plataforma, no pertenece a ninguna empresa y
 * se resuelve por su salvoconducto, no por alcance.
 *
 * Fail-closed: un rol sin empresa dueña no lo alcanza ningún tenant.
 */
export interface RoleBusinessScope {
  /** Ids de las empresas del alcance (hoy, la empresa activa de la petición). */
  businessUnitIds: number[]
}

/**
 * Resuelve el alcance a partir de los ids que dejó `businessScope` en
 * `ctx.businessUnitScope`.
 */
export async function buildRoleBusinessScope(
  businessUnitIds: readonly number[]
): Promise<RoleBusinessScope> {
  return { businessUnitIds: [...businessUnitIds] }
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
    if (scope.businessUnitIds.length === 0) {
      // Sin empresa en el alcance no hay rol que alcanzar. Explícito, para que
      // un alcance vacío no se lea como "todos".
      scoped.whereRaw('1 = 0')
      return
    }

    scoped.whereIn('business_unit_id', scope.businessUnitIds)
  })
}

/**
 * Misma decisión que `applyRoleBusinessScope`, en memoria, para cuando el rol
 * ya está cargado. Las dos tienen que responder lo mismo.
 */
export function isRoleInBusinessScope(role: Role, scope: RoleBusinessScope): boolean {
  const owner = role.businessUnitId

  return owner !== null && owner !== undefined && scope.businessUnitIds.includes(owner)
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
