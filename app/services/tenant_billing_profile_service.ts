import BusinessUnit from '#models/business_unit'
import TenantBillingProfile from '#models/tenant_billing_profile'
import db from '@adonisjs/lucid/services/db'
import type {
  TenantBillingProfileUpsertInput,
  TenantBillingProfileView,
} from '../interfaces/tenant_billing_profile_interface.js'
import { blindIndex } from '#utils/blind_index'
import { TenantContext } from '#utils/tenant_context'
import {
  tenantBillingBusinessUnitNotFoundError,
  tenantBillingProfileConflictError,
} from '#helpers/tenant_billing_profile_error'

const ER_DUP_ENTRY = 'ER_DUP_ENTRY'

/**
 * Servicio del perfil de facturación fiscal del tenant (USRH1786737531057).
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

    return {
      exists: false,
      rfc: null,
      legalName: businessUnit.businessUnitLegalName,
      createdAt: null,
      updatedAt: null,
    }
  }

  /**
   * Crea o actualiza el perfil vivo de la empresa (regla 1).
   * Si `rfc` no viene en el input, conserva el valor previo; `null` lo limpia.
   */
  async upsertForTenant(
    businessUnitId: number,
    input: TenantBillingProfileUpsertInput
  ): Promise<TenantBillingProfileView> {
    await this.assertBusinessUnitExists(businessUnitId)

    try {
      const profile = await db.transaction(async (trx) => {
        let row = await TenantBillingProfile.query({ client: trx })
          .where('businessUnitId', businessUnitId)
          .first()

        if (!row) {
          row = new TenantBillingProfile()
          row.businessUnitId = businessUnitId
        }

        row.useTransaction(trx)
        row.legalName = input.legalName.trim()
        this.applyRfcUpdate(row, input.rfc)

        await row.save()
        return row
      })

      await profile.refresh()
      return this.toView(profile, true)
    } catch (error) {
      this.rethrowProfileConflict(error)
    }
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

  private toView(profile: TenantBillingProfile, exists: boolean): TenantBillingProfileView {
    return {
      exists,
      rfc: profile.rfc,
      legalName: profile.legalName,
      createdAt: profile.createdAt.toISO(),
      updatedAt: profile.updatedAt?.toISO() ?? null,
    }
  }
}
