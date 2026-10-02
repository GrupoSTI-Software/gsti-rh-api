/**
 * Por qué una atribución ya no genera comisión. `closed` gana sobre
 * `term_exhausted` cuando coinciden: cerrada es el estado más definitivo.
 */
export type AllianceAttributionNotAccruingReason = 'term_exhausted' | 'closed'

/**
 * Contrato de la atribución alianza↔cliente (USRH1789099318034).
 * Forma canónica: nadie la redefine. El interno `business_unit_id`
 * nunca viaja; el contrato habla `businessUnitPublicId`.
 *
 * Los cinco campos de avance (USRH1787719056818) se calculan al consultar
 * desde las comisiones ya escritas: no se persisten.
 */
export interface AllianceAttributionView {
  allianceAttributionId: number
  allianceId: number
  allianceName: string
  businessUnitPublicId: string
  businessUnitName: string
  allianceAttributionCommissionPercent: number
  allianceAttributionTermPeriods: number | null
  allianceAttributionStartsAt: string
  allianceAttributionClosedAt: string | null
  allianceAttributionCloseReason: string | null
  allianceAttributionIsLive: boolean
  /** Suma de `alliance_commission_periods`. Cero si no hay comisiones. */
  allianceAttributionAccruedPeriods: number
  /**
   * Plazo menos lo devengado, nunca negativo. `null` es plazo
   * indeterminado ("sin límite"), nunca 0.
   */
  allianceAttributionRemainingPeriods: number | null
  /**
   * Falso si está cerrada o si el plazo determinado ya se agotó.
   * Una alianza desactivada sigue generando.
   */
  allianceAttributionIsAccruing: boolean
  /** `null` si sigue generando. Cerrada gana sobre plazo agotado. */
  allianceAttributionNotAccruingReason: AllianceAttributionNotAccruingReason | null
  /**
   * Suma de `alliance_commission_amount_cents` (pagadas y por pagar,
   * sin distinguir). Cero informado como dato, no como ausencia.
   */
  allianceAttributionAccruedAmountCents: number
  createdAt: string
  updatedAt: string | null
}

/**
 * Alta. `allianceAttributionCommissionPercent` y
 * `allianceAttributionTermPeriods` ausentes heredan de la alianza.
 * `termPeriods: null` explícito deja el plazo indeterminado para este
 * cliente aunque la alianza tenga plazo determinado.
 */
export interface CreateAllianceAttributionInput {
  allianceId: number
  businessUnitPublicId: string
  allianceAttributionStartsAt: string
  allianceAttributionCommissionPercent?: number
  allianceAttributionTermPeriods?: number | null
}

/**
 * Ajuste de una atribución viva. Ausente conserva lo persistido.
 * `termPeriods: null` pasa el plazo a indeterminado. No acepta
 * alianza ni empresa cliente.
 */
export interface UpdateAllianceAttributionInput {
  allianceAttributionCommissionPercent?: number
  allianceAttributionTermPeriods?: number | null
  allianceAttributionStartsAt?: string
}

/** Cierre de una atribución viva. Fecha y motivo son obligatorios. */
export interface CloseAllianceAttributionInput {
  allianceAttributionClosedAt: string
  allianceAttributionCloseReason: string
}

/** Filtros del listado de atribuciones por alianza. */
export interface ListAllianceAttributionsByAllianceFilters {
  page?: number
  limit?: number
}

/** Resultado paginado de atribuciones de una alianza. */
export interface ListAllianceAttributionsByAllianceResult {
  data: AllianceAttributionView[]
  meta: {
    total: number
    page: number
    limit: number
    lastPage: number
  }
}
