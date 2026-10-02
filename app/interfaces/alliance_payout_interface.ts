/** Body de `POST /api/platform/alliances/:allianceId/payouts`. */
export interface CreateAlliancePayoutInput {
  commissionIds: number[]
  /** `YYYY-MM-DD`, día en que GSTI le pagó a la alianza (hora de México). */
  paidOn: string
  /** Referencia de una línea, hasta 160 caracteres. */
  reference: string
}

/** Estado de una liquidación derivado de si tiene fecha de anulación. */
export type AlliancePayoutStatus = 'registered' | 'annulled'

/**
 * Elemento del historial de liquidaciones de una alianza
 * (USRH1787719056821, reglas 1 y 2).
 */
export interface AlliancePayoutListItem {
  alliancePayoutId: number
  allianceId: number
  /** `YYYY-MM-DD` */
  alliancePayoutPaidOn: string
  alliancePayoutReference: string
  alliancePayoutAmountCents: number
  /** Filas del pivote (vivas + anuladas) de ESTA liquidación. */
  alliancePayoutCommissionsCount: number
  alliancePayoutStatus: AlliancePayoutStatus
  /** `"{person_firstname} {person_lastname}"` de quien registró la liquidación. */
  alliancePayoutCreatedByName: string
  /** ISO-8601; `null` si sigue registrada. */
  alliancePayoutAnnulledAt: string | null
  alliancePayoutAnnulmentReason: string | null
  /** Nombre completo de quien anuló; `null` si sigue registrada. */
  alliancePayoutAnnulledByName: string | null
  /** ISO-8601 de creación de la liquidación. */
  createdAt: string
}

/** Input para la anulación (USRH1787719056821, regla 5). */
export interface AnnulAlliancePayoutInput {
  reason: string
}

/** Detalle de liquidación con el rastro de sus comisiones (CA-5). */
export interface AlliancePayoutDetailView extends AlliancePayoutListItem {
  /** Comisiones de ESTA liquidación con su estado actual. Sin paginar (≤ 200). */
  alliancePayoutCommissions: import('./alliance_commission_interface.js').AllianceCommissionListItem[]
}

/** Resultado paginado del historial de liquidaciones. */
export interface ListAlliancePayoutsResult {
  data: AlliancePayoutListItem[]
  meta: { total: number; page: number; limit: number; lastPage: number }
}

/** Filtros de la consulta del historial. */
export interface ListAlliancePayoutsFilters {
  page?: number
  limit?: number
}

/**
 * Vista pública de una liquidación recién registrada. `USRH1787719056821`
 * extiende esta vista con estado, anulación y detalle; no la redefine.
 */
export interface AlliancePayoutView {
  alliancePayoutId: number
  allianceId: number
  /** `YYYY-MM-DD` */
  alliancePayoutPaidOn: string
  alliancePayoutReference: string
  alliancePayoutAmountCents: number
  alliancePayoutCommissionsCount: number
  /** Ascendente. */
  allianceCommissionIds: number[]
  alliancePayoutCreatedByUserId: number
  /** `"{person_firstname} {person_lastname}"` */
  alliancePayoutCreatedByName: string
  /** ISO-8601 */
  createdAt: string
}
