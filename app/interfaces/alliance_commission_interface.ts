/**
 * Liquidación viva de la comisión. Poblada desde `USRH1787719056820`:
 * `null` cuando la comisión sigue por pagar, y el rastro de la
 * liquidación (fecha, referencia, quién) cuando ya está pagada.
 */
export interface AllianceCommissionLivePayout {
  alliancePayoutId: number
  paidOn: string
  reference: string
  createdByName: string
}

/** Estado de una comisión: pagada = pertenece a una liquidación registrada (regla 11). */
export type AllianceCommissionStatus = 'pending' | 'paid'

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
  allianceCommissionStatus: AllianceCommissionStatus
  livePayout: AllianceCommissionLivePayout | null
  createdAt: string
}

/**
 * Totales devengados del rango consultado (regla 4, 7, 8, 14 y 15).
 * `accruedCount = paidCount + pendingCount` y lo mismo en centavos;
 * responden solo al rango de fechas, nunca al filtro de estado.
 */
export interface AllianceCommissionTotals {
  accruedCount: number
  accruedCents: number
  paidCount: number
  paidCents: number
  pendingCount: number
  pendingCents: number
}

/** Filtros de `GET /api/platform/alliances/:allianceId/commissions`. */
export interface ListAllianceCommissionsFilters {
  from?: string
  to?: string
  /** Acota solo el detalle (`data`), nunca `meta.totals` (regla 13). */
  status?: AllianceCommissionStatus
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
