/**
 * Empresa destino de una provisión por tenant.
 *
 * Existe para que el llamador nombre cada dato: `businessUnitSlug` y
 * `businessUnitName` son ambos `string`, así que como parámetros posicionales
 * podían invertirse sin que el compilador lo notara, sembrando el slug opaco
 * (`bu-<12>`) como nombre comercial de la empresa nueva.
 */
interface TenantProvisioningTargetInterface {
  /** `business_units.business_unit_id` de la empresa recién creada. */
  businessUnitId: number
  /** Slug opaco de la empresa; se copia al CSV legacy `system_setting_business_units`. */
  businessUnitSlug: string
  /** Nombre de la empresa; se siembra como nombre comercial de su configuración. */
  businessUnitName: string
}

export type { TenantProvisioningTargetInterface }
