/**
 * Liquidación viva de la comisión. Contrato hacia adelante: siempre `null`
 * en esta rebanada (USRH1789529505468), porque las tablas de liquidaciones
 * no existen todavía. `USRH1787719056820` la puebla, sin cambiar la forma.
 */
export interface AllianceCommissionLivePayout {
  alliancePayoutId: number
  paidOn: string
  reference: string
  createdByName: string
}

/** Fila de comisión devengada para el estado de cuenta de la alianza. */
export interface AllianceCommissionListItem {
  allianceCommissionId: number
  allianceId: number
  allianceAttributionId: number
  businessUnitPublicId: string
  businessUnitName: string
  billingPaymentId: number
  billingSubscriptionId: number
  billingPaymentPaidAt: string
  allianceCommissionAccruedOn: string
  allianceCommissionPeriods: number
  allianceCommissionBaseCents: number
  allianceCommissionPercent: number
  allianceCommissionAmountCents: number
  livePayout: AllianceCommissionLivePayout | null
  createdAt: string
}

/** Totales devengados del rango consultado (regla 4, 7 y 8). */
export interface AllianceCommissionTotals {
  accruedCount: number
  accruedCents: number
}

/** Filtros de `GET /api/platform/alliances/:allianceId/commissions`. */
export interface ListAllianceCommissionsFilters {
  from?: string
  to?: string
  page?: number
  limit?: number
}

/** Resultado paginado con totales del mismo rango que el listado (regla 8). */
export interface ListAllianceCommissionsResult {
  data: AllianceCommissionListItem[]
  meta: {
    total: number
    page: number
    limit: number
    lastPage: number
    totals: AllianceCommissionTotals
  }
}
