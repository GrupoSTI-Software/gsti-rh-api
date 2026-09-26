import BusinessUnit from '#models/business_unit'
import SatCfdiUse from '#models/sat_cfdi_use'
import SatTaxRegime from '#models/sat_tax_regime'
import TenantBillingProfile from '#models/tenant_billing_profile'
import db from '@adonisjs/lucid/services/db'
import type {
  TenantBillingProfileUpsertInput,
  TenantBillingProfileView,
  TenantFiscalIdentity,
} from '../interfaces/tenant_billing_profile_interface.js'
import { blindIndex } from '#utils/blind_index'
import { TenantContext } from '#utils/tenant_context'
import { deriveTaxpayerTypeFromRfc } from '#helpers/sat_taxpayer_type'
import { computeBillingProfileCompleteness } from '#helpers/tenant_billing_profile_completeness'
import {
  tenantBillingBusinessUnitNotFoundError,
  tenantBillingCfdiUseNotForRegimeError,
  tenantBillingCfdiUseUnknownError,
  tenantBillingProfileConflictError,
  tenantBillingTaxRegimeNotForPersonTypeError,
  tenantBillingTaxRegimeUnknownError,
} from '#helpers/tenant_billing_profile_error'

const ER_DUP_ENTRY = 'ER_DUP_ENTRY'

/** Campos opcionales/nullable del perfil que siguen la semántica "ausente = conservar, null = limpiar". */
type OptionalNullableProfileField =
  | 'postalCode'
  | 'taxRegimeCode'
  | 'billingEmail'
  | 'cfdiUseCode'
  | 'street'
  | 'exteriorNumber'
  | 'interiorNumber'
  | 'neighborhood'
  | 'municipality'
  | 'state'
  | 'legalRepresentativeName'
  | 'legalRepresentativeRole'

/** Domicilio y representante (USRH1789097550393), en el orden en que se aplican y se publican. */
const FISCAL_IDENTITY_FIELDS = [
  'street',
  'exteriorNumber',
  'interiorNumber',
  'neighborhood',
  'municipality',
  'state',
  'legalRepresentativeName',
  'legalRepresentativeRole',
] as const satisfies readonly OptionalNullableProfileField[]

/**
 * Servicio del perfil de facturación fiscal del tenant (USRH1786737531057, USRH1786737531066).
 */
export default class TenantBillingProfileService {
  /**
   * Resuelve el `business_unit_id` activo del tenant desde el contexto de la request.
   */
  resolveActiveBusinessUnitId(): number {
    const businessUnitId = TenantContext.getScope()[0]
    if (!businessUnitId || businessUnitId <= 0) {
      throw tenantBillingBusinessUnitNotFoundError(
        'No se pudo determinar la empresa activa para consultar el perfil de facturación.'
      )
    }

    return businessUnitId
  }

  /**
   * Consulta el perfil vivo de la empresa o propone la razón social fiscal heredada
   * desde `business_unit_legal_name` cuando aún no existe registro (regla 6).
   */
  async getForTenant(businessUnitId: number): Promise<TenantBillingProfileView> {
    const profile = await TenantBillingProfile.query()
      .where('businessUnitId', businessUnitId)
      .first()

    if (profile) {
      return this.toView(profile, true)
    }

    const businessUnit = await BusinessUnit.query()
      .where('businessUnitId', businessUnitId)
      .whereNull('business_unit_deleted_at')
      .first()

    if (!businessUnit) {
      throw tenantBillingBusinessUnitNotFoundError(
        'No se pudo determinar la empresa activa para consultar el perfil de facturación.'
      )
    }

    return this.toInheritedView(businessUnit.businessUnitLegalName)
  }

  /**
   * Crea o actualiza el perfil vivo de la empresa (regla 1).
   * Campos ausentes conservan el valor previo; `null` explícito los limpia.
   * Validación cruzada contra el catálogo sembrado antes de persistir (§7.1).
   */
  async upsertForTenant(
    businessUnitId: number,
    input: TenantBillingProfileUpsertInput
  ): Promise<TenantBillingProfileView> {
    await this.assertBusinessUnitExists(businessUnitId)

    const existing = await TenantBillingProfile.query()
      .where('businessUnitId', businessUnitId)
      .first()

    await this.validateCatalogRules(input, existing)

    try {
      const profile = await db.transaction(async (trx) => {
        let row = existing

        if (!row) {
          row = new TenantBillingProfile()
          row.businessUnitId = businessUnitId
        }

        row.useTransaction(trx)
        row.legalName = input.legalName.trim()
        this.applyRfcUpdate(row, input.rfc)
        this.applyOptionalNullableUpdate(row, 'postalCode', input.postalCode)
        this.applyOptionalNullableUpdate(row, 'taxRegimeCode', input.taxRegimeCode)
        this.applyOptionalNullableUpdate(row, 'billingEmail', input.billingEmail)
        this.applyOptionalNullableUpdate(row, 'cfdiUseCode', input.cfdiUseCode)
        for (const field of FISCAL_IDENTITY_FIELDS) {
          this.applyOptionalNullableUpdate(row, field, input[field])
        }

        await row.save()
        return row
      })

      await profile.refresh()
      return this.toView(profile, true)
    } catch (error) {
      this.rethrowProfileConflict(error)
    }
  }

  /**
   * Valida régimen y uso de CFDI contra el catálogo sembrado (máx. 2 consultas por PUT).
   */
  private async validateCatalogRules(
    input: TenantBillingProfileUpsertInput,
    existing: TenantBillingProfile | null
  ): Promise<void> {
    const effectiveRfc = this.resolveEffectiveValue(input.rfc, existing?.rfc ?? null)
    const effectiveTaxRegimeCode = this.resolveEffectiveValue(
      input.taxRegimeCode,
      existing?.taxRegimeCode ?? null
    )
    const effectiveCfdiUseCode = this.resolveEffectiveValue(
      input.cfdiUseCode,
      existing?.cfdiUseCode ?? null
    )

    if (input.taxRegimeCode !== undefined && input.taxRegimeCode !== null) {
      const taxRegime = await SatTaxRegime.query()
        .where('satTaxRegimeCode', input.taxRegimeCode)
        .first()

      if (!taxRegime) {
        throw tenantBillingTaxRegimeUnknownError()
      }

      const taxpayerType = deriveTaxpayerTypeFromRfc(effectiveRfc)

      if (taxpayerType === 'fisica' && taxRegime.satTaxRegimeAppliesToIndividual !== 1) {
        throw tenantBillingTaxRegimeNotForPersonTypeError()
      }

      if (taxpayerType === 'moral' && taxRegime.satTaxRegimeAppliesToLegalEntity !== 1) {
        throw tenantBillingTaxRegimeNotForPersonTypeError()
      }
    }

    const cfdiCodeToLoad = this.resolveCfdiUseCodeForValidation(
      input,
      effectiveTaxRegimeCode,
      effectiveCfdiUseCode
    )

    if (!cfdiCodeToLoad) {
      return
    }

    const cfdiUse = await SatCfdiUse.query()
      .where('satCfdiUseCode', cfdiCodeToLoad)
      .preload('taxRegimes')
      .first()

    if (!cfdiUse) {
      throw tenantBillingCfdiUseUnknownError()
    }

    if (
      input.cfdiUseCode !== undefined &&
      input.cfdiUseCode !== null &&
      effectiveTaxRegimeCode !== null &&
      !this.isCfdiUseAllowedForRegime(cfdiUse, effectiveTaxRegimeCode)
    ) {
      throw tenantBillingCfdiUseNotForRegimeError()
    }

    if (
      input.taxRegimeCode !== undefined &&
      input.cfdiUseCode === undefined &&
      effectiveTaxRegimeCode !== null &&
      effectiveCfdiUseCode !== null &&
      !this.isCfdiUseAllowedForRegime(cfdiUse, effectiveTaxRegimeCode)
    ) {
      throw tenantBillingCfdiUseNotForRegimeError()
    }
  }

  private resolveCfdiUseCodeForValidation(
    input: TenantBillingProfileUpsertInput,
    effectiveTaxRegimeCode: string | null,
    effectiveCfdiUseCode: string | null
  ): string | null {
    if (input.cfdiUseCode !== undefined && input.cfdiUseCode !== null) {
      return input.cfdiUseCode
    }

    if (
      input.taxRegimeCode !== undefined &&
      effectiveTaxRegimeCode !== null &&
      effectiveCfdiUseCode !== null
    ) {
      return effectiveCfdiUseCode
    }

    return null
  }

  private isCfdiUseAllowedForRegime(cfdiUse: SatCfdiUse, taxRegimeCode: string): boolean {
    return cfdiUse.taxRegimes.some((regime) => regime.satTaxRegimeCode === taxRegimeCode)
  }

  private resolveEffectiveValue(
    inputValue: string | null | undefined,
    existingValue: string | null
  ): string | null {
    if (inputValue !== undefined) {
      return inputValue
    }

    return existingValue
  }

  /**
   * Identidad de la empresa para documentos formales (USRH1789097550393):
   * razón social, domicilio y representante — NUNCA el RFC ni su huella.
   * Filtra por `business_unit_id` explícito (el mixin es fail-open sin
   * contexto). Sin perfil, la razón social sale de `business_units` y el
   * resto queda en `null`. No lanza por domicilio incompleto: eso lo decide
   * la guarda de completitud del documento que lo consuma.
   */
  async getFiscalIdentityForDocuments(businessUnitId: number): Promise<TenantFiscalIdentity> {
    const profile = await TenantBillingProfile.query()
      .where('business_unit_id', businessUnitId)
      .first()

    if (profile) {
      return {
        legalName: profile.legalName,
        postalCode: profile.postalCode,
        street: profile.street,
        exteriorNumber: profile.exteriorNumber,
        interiorNumber: profile.interiorNumber,
        neighborhood: profile.neighborhood,
        municipality: profile.municipality,
        state: profile.state,
        legalRepresentativeName: profile.legalRepresentativeName,
        legalRepresentativeRole: profile.legalRepresentativeRole,
      }
    }

    const businessUnit = await this.assertBusinessUnitExists(businessUnitId)
    return {
      legalName: businessUnit.businessUnitLegalName,
      postalCode: null,
      street: null,
      exteriorNumber: null,
      interiorNumber: null,
      neighborhood: null,
      municipality: null,
      state: null,
      legalRepresentativeName: null,
      legalRepresentativeRole: null,
    }
  }

  private applyOptionalNullableUpdate(
    profile: TenantBillingProfile,
    field: OptionalNullableProfileField,
    value: string | null | undefined
  ): void {
    if (value === undefined) {
      return
    }

    profile[field] = value
  }

  private applyRfcUpdate(profile: TenantBillingProfile, rfc: string | null | undefined): void {
    if (rfc === undefined) {
      return
    }

    if (rfc === null) {
      profile.rfc = null
      profile.rfcHash = null
      return
    }

    profile.rfc = rfc
    profile.rfcHash = blindIndex(rfc)
  }

  private async assertBusinessUnitExists(businessUnitId: number): Promise<BusinessUnit> {
    const businessUnit = await BusinessUnit.query()
      .where('businessUnitId', businessUnitId)
      .whereNull('business_unit_deleted_at')
      .first()

    if (!businessUnit) {
      throw tenantBillingBusinessUnitNotFoundError(
        'No se pudo determinar la empresa activa para guardar el perfil de facturación.'
      )
    }

    return businessUnit
  }

  private rethrowProfileConflict(error: unknown): never {
    const dbError = error as { code?: string; sqlMessage?: string }

    if (
      dbError?.code === ER_DUP_ENTRY &&
      dbError.sqlMessage?.includes('tenant_billing_profiles_business_unit_active_unique')
    ) {
      throw tenantBillingProfileConflictError()
    }

    throw error
  }

  private toInheritedView(legalName: string): TenantBillingProfileView {
    const completeness = computeBillingProfileCompleteness({
      rfc: null,
      legalName,
      postalCode: null,
      taxRegimeCode: null,
      cfdiUseCode: null,
    })

    return {
      exists: false,
      rfc: null,
      legalName,
      postalCode: null,
      taxRegimeCode: null,
      billingEmail: null,
      cfdiUseCode: null,
      street: null,
      exteriorNumber: null,
      interiorNumber: null,
      neighborhood: null,
      municipality: null,
      state: null,
      legalRepresentativeName: null,
      legalRepresentativeRole: null,
      taxpayerType: null,
      billingProfileComplete: completeness.complete,
      missingFields: completeness.missingFields,
      createdAt: null,
      updatedAt: null,
    }
  }

  private toView(profile: TenantBillingProfile, exists: boolean): TenantBillingProfileView {
    const completeness = computeBillingProfileCompleteness({
      rfc: profile.rfc,
      legalName: profile.legalName,
      postalCode: profile.postalCode,
      taxRegimeCode: profile.taxRegimeCode,
      cfdiUseCode: profile.cfdiUseCode,
    })

    return {
      exists,
      rfc: profile.rfc,
      legalName: profile.legalName,
      postalCode: profile.postalCode,
      taxRegimeCode: profile.taxRegimeCode,
      billingEmail: profile.billingEmail,
      cfdiUseCode: profile.cfdiUseCode,
      // Domicilio y representante (USRH1789097550393), campo por campo: nunca un spread del modelo
      street: profile.street,
      exteriorNumber: profile.exteriorNumber,
      interiorNumber: profile.interiorNumber,
      neighborhood: profile.neighborhood,
      municipality: profile.municipality,
      state: profile.state,
      legalRepresentativeName: profile.legalRepresentativeName,
      legalRepresentativeRole: profile.legalRepresentativeRole,
      taxpayerType: deriveTaxpayerTypeFromRfc(profile.rfc),
      billingProfileComplete: completeness.complete,
      missingFields: completeness.missingFields,
      createdAt: profile.createdAt.toISO(),
      updatedAt: profile.updatedAt?.toISO() ?? null,
    }
  }
}
