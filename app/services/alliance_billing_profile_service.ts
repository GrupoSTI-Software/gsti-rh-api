import Alliance from '#models/alliance'
import AllianceBillingProfile from '#models/alliance_billing_profile'
import SatCfdiUse from '#models/sat_cfdi_use'
import SatTaxRegime from '#models/sat_tax_regime'
import db from '@adonisjs/lucid/services/db'
import { ALLIANCE_ERRORS } from '#constants/alliance_error_codes'
import { AllianceServiceError } from '#exceptions/alliance_service_error'
import { assertPositiveAllianceId } from '#services/alliance_service'
import { deriveTaxpayerTypeFromRfc } from '#helpers/sat_taxpayer_type'
import { computeBillingProfileCompleteness } from '#helpers/tenant_billing_profile_completeness'
import { blindIndex } from '#utils/blind_index'
import type {
  AllianceBillingProfileUpsertInput,
  AllianceBillingProfileView,
} from '../interfaces/alliance_interface.js'

const ER_DUP_ENTRY = 'ER_DUP_ENTRY'

function throwFromCatalog(
  catalog: (typeof ALLIANCE_ERRORS)[keyof typeof ALLIANCE_ERRORS]
): never {
  throw new AllianceServiceError(
    catalog.detail,
    catalog.code,
    catalog.status,
    catalog.key,
    catalog.detail
  )
}

/**
 * Perfil fiscal de la alianza comercial (USRH1788505941893).
 * Transacción propia: no acepta `trx` externo.
 */
export default class AllianceBillingProfileService {
  async getBillingProfile(allianceId: number): Promise<AllianceBillingProfileView> {
    const alliance = await this.assertAllianceExists(allianceId)
    const profile = await this.findLiveProfile(allianceId)

    if (profile) {
      return this.toView(profile, true)
    }

    return this.toInheritedView(alliance.allianceName)
  }

  async upsertBillingProfile(
    allianceId: number,
    input: AllianceBillingProfileUpsertInput
  ): Promise<AllianceBillingProfileView> {
    await this.assertAllianceExists(allianceId)

    const existing = await this.findLiveProfile(allianceId)
    await this.validateCatalogRules(input, existing)

    try {
      const profile = await db.transaction(async (trx) => {
        let row = existing

        if (!row) {
          row = new AllianceBillingProfile()
          row.allianceId = allianceId
        }

        row.useTransaction(trx)
        row.legalName = input.legalName.trim()
        this.applyRfcUpdate(row, input.rfc)
        this.applyOptionalNullableUpdate(row, 'postalCode', input.postalCode)
        this.applyOptionalNullableUpdate(row, 'taxRegimeCode', input.taxRegimeCode)
        this.applyOptionalNullableUpdate(row, 'cfdiUseCode', input.cfdiUseCode)
        this.applyOptionalNullableUpdate(row, 'billingEmail', input.billingEmail)

        await row.save()
        return row
      })

      await profile.refresh()
      return this.toView(profile, true)
    } catch (error) {
      this.rethrowProfileConflict(error)
    }
  }

  private async assertAllianceExists(allianceId: number): Promise<Alliance> {
    assertPositiveAllianceId(allianceId)

    const alliance = await Alliance.query()
      .where('alliance_id', allianceId)
      .whereNull('alliance_deleted_at')
      .first()

    if (!alliance) {
      throwFromCatalog(ALLIANCE_ERRORS.NOT_FOUND)
    }

    return alliance
  }

  private async findLiveProfile(allianceId: number): Promise<AllianceBillingProfile | null> {
    return AllianceBillingProfile.query()
      .where('alliance_id', allianceId)
      .whereNull('alliance_billing_profile_deleted_at')
      .first()
  }

  /**
   * Validación cruzada SAT (máx. 2 consultas por PUT).
   * Si no hay RFC, la regla régimen ↔ persona no se evalúa.
   */
  private async validateCatalogRules(
    input: AllianceBillingProfileUpsertInput,
    existing: AllianceBillingProfile | null
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
        throwFromCatalog(ALLIANCE_ERRORS.TAX_REGIME_UNKNOWN)
      }

      const taxpayerType = deriveTaxpayerTypeFromRfc(effectiveRfc)

      if (taxpayerType === 'fisica' && taxRegime.satTaxRegimeAppliesToIndividual !== 1) {
        throwFromCatalog(ALLIANCE_ERRORS.TAX_REGIME_NOT_FOR_PERSON_TYPE)
      }

      if (taxpayerType === 'moral' && taxRegime.satTaxRegimeAppliesToLegalEntity !== 1) {
        throwFromCatalog(ALLIANCE_ERRORS.TAX_REGIME_NOT_FOR_PERSON_TYPE)
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
      throwFromCatalog(ALLIANCE_ERRORS.CFDI_USE_UNKNOWN)
    }

    if (
      input.cfdiUseCode !== undefined &&
      input.cfdiUseCode !== null &&
      effectiveTaxRegimeCode !== null &&
      !this.isCfdiUseAllowedForRegime(cfdiUse, effectiveTaxRegimeCode)
    ) {
      throwFromCatalog(ALLIANCE_ERRORS.CFDI_USE_NOT_FOR_REGIME)
    }

    if (
      input.taxRegimeCode !== undefined &&
      input.cfdiUseCode === undefined &&
      effectiveTaxRegimeCode !== null &&
      effectiveCfdiUseCode !== null &&
      !this.isCfdiUseAllowedForRegime(cfdiUse, effectiveTaxRegimeCode)
    ) {
      throwFromCatalog(ALLIANCE_ERRORS.CFDI_USE_NOT_FOR_REGIME)
    }
  }

  private resolveCfdiUseCodeForValidation(
    input: AllianceBillingProfileUpsertInput,
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

  private applyOptionalNullableUpdate(
    profile: AllianceBillingProfile,
    field: 'postalCode' | 'taxRegimeCode' | 'cfdiUseCode' | 'billingEmail',
    value: string | null | undefined
  ): void {
    if (value === undefined) {
      return
    }

    profile[field] = value
  }

  private applyRfcUpdate(
    profile: AllianceBillingProfile,
    rfc: string | null | undefined
  ): void {
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

  private rethrowProfileConflict(error: unknown): never {
    const dbError = error as { code?: string; sqlMessage?: string }

    if (
      dbError?.code === ER_DUP_ENTRY &&
      dbError.sqlMessage?.includes('alliance_billing_profiles_alliance_active_unique')
    ) {
      throwFromCatalog(ALLIANCE_ERRORS.BILLING_PROFILE_CONFLICT)
    }

    throw error
  }

  private toInheritedView(legalName: string): AllianceBillingProfileView {
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
      cfdiUseCode: null,
      billingEmail: null,
      taxpayerType: null,
      billingProfileComplete: completeness.complete,
      missingFields: completeness.missingFields,
      createdAt: null,
      updatedAt: null,
    }
  }

  /** DTO plano a mano: lee `profile.rfc` del modelo, nunca `.serialize()`. */
  private toView(profile: AllianceBillingProfile, exists: boolean): AllianceBillingProfileView {
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
      cfdiUseCode: profile.cfdiUseCode,
      billingEmail: profile.billingEmail,
      taxpayerType: deriveTaxpayerTypeFromRfc(profile.rfc),
      billingProfileComplete: completeness.complete,
      missingFields: completeness.missingFields,
      createdAt: profile.createdAt.toISO(),
      updatedAt: profile.updatedAt?.toISO() ?? null,
    }
  }
}
