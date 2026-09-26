import { TenantContext } from '#utils/tenant_context'
import ProveedorRepse from '#models/proveedor_repse'
import { REPSE_PROVIDER_ERROR_CODES } from '#constants/repse_provider_error_codes'
import { RepseProviderError } from '#exceptions/repse_provider_error'

/**
 * Helpers de aislamiento multi-tenant compartidos por el catálogo de
 * proveedores REPSE y su bitácora de validaciones (USRH1784259105646).
 *
 * Mismo patrón que `app/helpers/repse_tenant_scope.ts` (lado prestador), pero
 * acotado a este módulo para no acoplar el dominio "lado contratante" con el
 * helper compartido del REPSE-prestador.
 */

/** Ids de unidades de negocio accesibles para la request actual (scope central). */
export async function getAllowedBusinessUnitIds(): Promise<number[]> {
  return TenantContext.getScope()
}

/** Valida que el `businessUnitId` pertenezca al tenant del usuario autenticado. */
export async function assertBusinessUnitInTenant(businessUnitId: number): Promise<void> {
  const allowed = await getAllowedBusinessUnitIds()
  if (!allowed.includes(businessUnitId)) {
    throw new RepseProviderError(
      'La empresa no existe o no pertenece al tenant actual.',
      REPSE_PROVIDER_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
      404,
      'empresa-no-encontrada'
    )
  }
}

/**
 * Recupera un proveedor REPSE no borrado lógicamente cuya empresa pertenezca
 * al tenant actual. Lanza 404 uniforme cuando no existe o vive en otro tenant.
 */
export async function findProveedorRepseInTenantOrFail(
  proveedorRepseId: number,
  notFoundKey: string = 'proveedor-repse-no-encontrado'
): Promise<ProveedorRepse> {
  const allowed = await getAllowedBusinessUnitIds()
  if (allowed.length === 0) {
    throw new RepseProviderError(
      'El proveedor REPSE no existe o no pertenece al tenant actual.',
      REPSE_PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND,
      404,
      notFoundKey
    )
  }

  const row = await ProveedorRepse.query()
    .where('proveedor_repse_id', proveedorRepseId)
    .whereNull('proveedor_repse_deleted_at')
    .whereIn('business_unit_id', allowed)
    .first()

  if (!row) {
    throw new RepseProviderError(
      'El proveedor REPSE no existe o no pertenece al tenant actual.',
      REPSE_PROVIDER_ERROR_CODES.PROVIDER_NOT_FOUND,
      404,
      notFoundKey
    )
  }
  return row
}
