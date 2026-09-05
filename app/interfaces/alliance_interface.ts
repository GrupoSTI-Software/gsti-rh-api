/**
 * Formas canónicas de la alianza comercial
 * (USRH1788505941892 / USRH1788505941893 / USRH1788505941894).
 *
 * Las HUs siguientes (03b, 06b) agregan campos a estas mismas
 * interfaces; ninguna las redefine. Esta HU no entrega
 * `allianceLiveAttributionsCount` ni `qrUrlPath` / `allianceQrReady`.
 */

import type { BillingProfileMissingField } from '../helpers/tenant_billing_profile_completeness.js'
import type { SatTaxpayerType } from '../helpers/sat_taxpayer_type.js'

export type { BillingProfileMissingField } from '../helpers/tenant_billing_profile_completeness.js'
export type { SatTaxpayerType } from '../helpers/sat_taxpayer_type.js'

export interface AllianceListItem {
  allianceId: number
  allianceName: string
  allianceContactName: string | null
  allianceContactEmail: string | null
  allianceDefaultCommissionPercent: number
  allianceDefaultTermPeriods: number | null
  allianceActive: 0 | 1
  createdAt: string
  billingProfileComplete: boolean
  missingFields: BillingProfileMissingField[]
}

/** Vista del perfil fiscal de la alianza. Única superficie que expone el RFC en claro. */
export interface AllianceBillingProfileView {
  exists: boolean
  rfc: string | null
  legalName: string
  postalCode: string | null
  taxRegimeCode: string | null
  cfdiUseCode: string | null
  billingEmail: string | null
  taxpayerType: SatTaxpayerType | null
  billingProfileComplete: boolean
  missingFields: BillingProfileMissingField[]
  createdAt: string | null
  updatedAt: string | null
}

export interface AllianceBillingProfileUpsertInput {
  legalName: string
  rfc?: string | null
  postalCode?: string | null
  taxRegimeCode?: string | null
  cfdiUseCode?: string | null
  billingEmail?: string | null
}

/** Vista del código de la alianza. 03b agrega `qrUrlPath` y `allianceQrReady`. */
export interface AllianceDiscountCodeView {
  discountCodeId: number
  discountCodeText: string
  discountCodeKind: 'percent' | 'fixed_amount' | 'unit_price'
  discountCodeValue: number
  discountCodeActive: 0 | 1
}

export interface AllianceView extends AllianceListItem {
  allianceContactPhone: string | null
  updatedAt: string | null
  allianceDiscountCode: AllianceDiscountCodeView | null
}

export interface CreateAllianceInput {
  allianceName: string
  allianceContactName?: string | null
  allianceContactEmail?: string | null
  allianceContactPhone?: string | null
  allianceDefaultCommissionPercent: number
  allianceDefaultTermPeriods?: number | null
}

export interface UpdateAllianceInput {
  allianceName?: string
  allianceContactName?: string | null
  allianceContactEmail?: string | null
  allianceContactPhone?: string | null
  allianceDefaultCommissionPercent?: number
  allianceDefaultTermPeriods?: number | null
}

export interface ListAlliancesFilters {
  search?: string
  active?: number
  page?: number
  limit?: number
}

export interface ListAlliancesResult {
  data: AllianceListItem[]
  meta: { total: number; page: number; limit: number; lastPage: number }
}
