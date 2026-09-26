import { TenantContext } from '#utils/tenant_context'

/**
 * Helpers de aislamiento multi-tenant del módulo de salidas de personal
 * (cadena CAP-05-07, creado por USRH1786568279581). Los slices posteriores
 * del módulo (`offboardings/`, `items/`, `evidences/`) reutilizan este
 * archivo; mismo patrón que `app/modules/repse-providers/tenant_scope.ts`,
 * acotado a este módulo para no acoplar dominios.
 *
 * El 404 uniforme de "concepto fuera del alcance" lo materializa el servicio
 * (`ConceptsService.notFoundError`): el acceso a datos vive en el adaptador
 * MySQL del slice, que recibe este alcance como parámetro.
 */

/** Ids de unidades de negocio accesibles para la request actual (scope central). */
export function getAllowedBusinessUnitIds(): number[] {
  return TenantContext.getScope()
}
