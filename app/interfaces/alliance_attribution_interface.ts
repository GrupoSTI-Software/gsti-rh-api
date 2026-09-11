/**
 * Contrato de la atribución alianza↔cliente (USRH1789099318034).
 * Forma canónica: nadie la redefine. El interno `business_unit_id`
 * nunca viaja; el contrato habla `businessUnitPublicId`.
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
