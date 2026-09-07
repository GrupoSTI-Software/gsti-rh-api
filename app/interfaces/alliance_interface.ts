/**
 * Formas canónicas de la alianza comercial (USRH1788505941892).
 *
 * Las HUs siguientes (02, 03a, 03b, 06b) agregan campos a estas mismas
 * interfaces; ninguna las redefine. Esta HU no entrega
 * `billingProfileComplete`, `allianceDiscountCode` ni
 * `allianceLiveAttributionsCount`.
 */

export interface AllianceListItem {
  allianceId: number
  allianceName: string
  allianceContactName: string | null
  allianceContactEmail: string | null
  allianceDefaultCommissionPercent: number
  allianceDefaultTermPeriods: number | null
  allianceActive: 0 | 1
  createdAt: string
}

export interface AllianceView extends AllianceListItem {
  allianceContactPhone: string | null
  updatedAt: string | null
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
